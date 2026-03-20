from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from typing import Optional, List

from pydantic import BaseModel, Field
from typing import Dict, Optional
from sentence_transformers import CrossEncoder
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.connectors.source import DataSource
from src.connectors.store import QDRANT_PATH
from src.utils.nlp import detect_language, extract_search_terms
from src.metrics.metrics import Metrics, TimedMetric, insert_metric, register_topics, register_user_activity, register_words
from src.connectors.search import hybrid_search
from src.utils.topic import resolve_topic_names

# ---------------------------------
# Model for LLM structured output
# ---------------------------------

class Source(BaseModel):
    """A source document cited in the response."""

    title: str = Field(description="The title or filename of the source document")
    source_type: str = Field(
        description="The type of source: 'Drive', 'Dropbox', or 'OneDrive'"
    )
    link: Optional[str] = Field(
        default=None,
        description="The webViewLink URL to the document (only available for Drive)",
    )


class RAGResponse(BaseModel):
    """Structured response from the RAG system."""

    answer: str = Field(
        description="The answer to the user's question based on the context provided"
    )
    sources: List[Source] = Field(
        description="List of the relevant sources used to craft the answer"
    )

# ---------------------------------
# RAG-related functions
# ---------------------------------

def get_reranker():
    return CrossEncoder("cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")


def rerank_documents(reranker, query: str, documents: list, top_k: int = None) -> list:
    """
    Reorders documents using a cross-encoder for improved accuracy.

    Args:
        query: The user query
        documents: List of documents (LangChain Document objects)
        top_k: Maximum number of documents to return (None = all)

    Returns:
        List of documents reordered by relevance
    """
    if not documents:
        return documents

    # Prepare tuples for the cross-encoder
    pairs = [(query, doc.page_content) for doc in documents]

    # Get scores from cross-encoder
    scores = reranker.predict(pairs)

    # Combine and sort by descending score
    scored_docs = list(zip(documents, scores))
    scored_docs.sort(key=lambda x: x[1], reverse=True)
    reranked_docs = [doc for doc, _ in scored_docs]

    if top_k is not None:
        reranked_docs = reranked_docs[:top_k]

    return reranked_docs


def retrieve_and_rerank(query: str, vectordb, reranker, sources: Dict[str, DataSource], k: int = 6) -> tuple:
    """Retrieval-only function: hybrid search + permission filtering + reranking.

    Returns:
        (allowed_chunks, available_sources, lang_code)
    """
    lang_code = detect_language(query)

    # Perform hybrid search
    search_results = hybrid_search(vectordb, query, k, 25, sources)

    # Filter by permissions
    allowed_chunks = []
    for f in search_results:
        file_id = f.metadata["id"]
        source = f.metadata["source"]

        if source not in sources:
            continue

        if not sources[source].has_access(file_id):
            continue

        allowed_chunks.append(f)

    # Rerank documents
    if allowed_chunks:
        allowed_chunks = rerank_documents(reranker, query, allowed_chunks, top_k=k)

    # Build available_sources list
    available_sources = []
    seen_ids = set()

    for d in allowed_chunks:
        doc_id = d.metadata.get("id")
        if doc_id not in seen_ids:
            seen_ids.add(doc_id)
            tag = d.metadata.get("source", "Unknown")
            title = d.metadata.get("title") or d.metadata.get("name") or "(sin titulo)"
            link = d.metadata.get("webViewLink")
            available_sources.append({"title": title, "source_type": tag, "link": link})

    return allowed_chunks, available_sources, lang_code


def get_rag_system_prompt(lang_code: str) -> str:
    """Build the RAG system prompt with the detected language."""
    return (
        "You are a RAG conversational assistant. Respond ONLY with the provided CONTEXT. "
        "Respond EXCLUSIVELY in the language of the last message of the user, "
        f"which has been detected to have the following language code: {lang_code}. "
        "Do not improvise if you don't have information in the context. "
        'In your response, do not use the word "CONTEXT", instead use "the sources". '
        "Write in natural, clear, and direct language. "
        "IMPORTANT: In the 'sources' field, include ONLY the sources you actually used to respond. "
        "If the question is a greeting, thanks, or does not require information from the sources, leave 'sources' empty. "
        "Use the conversation history to follow the thread. "
        "When calling search tools, always formulate the query argument as a fully "
        "self-contained search query. Resolve any pronouns, demonstratives, or "
        "conversational references (e.g. 'it', 'that', 'those', 'the same thing', "
        "'more about that') by replacing them with the specific terms from the "
        "conversation context, so the search query is understandable without "
        "prior conversation."
    )


# ---------------------------------
# Legacy function (kept for Streamlit app compatibility)
# ---------------------------------

def prepare_rag_context(query, pool, vectordb, reranker, sources: Dict[str, DataSource], k=6, chunk_chars=1600):
    """
    Prepares the RAG context: retrieves documents, filters by permissions, and reorders them.
    Returns (messages, available_sources, allowed_chunks, lang_code) or None if there are no results.
    """
    # Register that the user is still active
    register_user_activity(pool)

    # Detect language
    lang_code = detect_language(query)

    # Register search terms
    search_terms = extract_search_terms(query, lang_code)
    register_words(pool, search_terms, lang_code)

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

    allowed_chunks = []

    # Perform hybrid search in order to get relevant documents
    insert_metric(pool, Metrics.NUM_RAG_TOKENS_IN.value, llm.get_num_tokens(query))

    with TimedMetric(pool, Metrics.DOC_RESPONSE_TIME.value):
        search_results = hybrid_search(vectordb, query, k, 25, sources)

        for f in search_results:
            file_id = f.metadata["id"]
            source = f.metadata["source"]

            if source not in sources:
                continue

            # Check permissions
            if not sources[source].has_access(file_id):
                continue

            allowed_chunks.append(f)

        # Rerank documents
        if allowed_chunks:
            allowed_chunks = rerank_documents(reranker, query, allowed_chunks, top_k=k)

    if not allowed_chunks:
        return RAGResponse('', []), None, None, lang_code

    # Register found chunk topics
    topic_indices = {t for d in allowed_chunks for t, _ in d.metadata.get("topics", {}).items()}
    topics_for_db = resolve_topic_names(topic_indices, "es", QDRANT_PATH)

    register_topics(pool, topics_for_db)

    insert_metric(pool, Metrics.NUM_DOCS_RAG.value, len(allowed_chunks))

    # Prepare context
    def get_doc_info(d):
        tag = d.metadata.get("source", "Unknown")
        title = d.metadata.get("title") or d.metadata.get("name") or "(sin titulo)"
        link = d.metadata.get("webViewLink")
        return tag, title, link

    def cite(d):
        tag, title, link = get_doc_info(d)
        link_info = f" (Link: {link})" if link else ""
        return f"[{tag}:{title}{link_info}] {(d.page_content or '')[:chunk_chars]}"

    available_sources = []
    seen_ids = set()

    for d in allowed_chunks:
        doc_id = d.metadata.get("id")

        if doc_id not in seen_ids:
            seen_ids.add(doc_id)
            tag, title, link = get_doc_info(d)
            available_sources.append({"title": title, "source_type": tag, "link": link})

    contexto = "\n\n".join(cite(d) for d in allowed_chunks)

    insert_metric(pool, Metrics.NUM_RAG_TOKENS_OUT.value, llm.get_num_tokens(contexto))

    # Prepare system prompt for the LLM
    system = get_rag_system_prompt(lang_code)

    # Include links in the sources list so the LLM can return them
    sources_info = "\n".join(
        [
            f"- title: {s['title']}, type: {s['source_type']}, link: {s.get('link') or 'N/A'}"
            for s in available_sources
        ]
    )

    messages = [SystemMessage(content=system)]

    user_message = f"""CONTEXT:
{contexto}

AVAILABLE SOURCES:
{sources_info}

QUESTION:
{query}"""

    messages.append(HumanMessage(content=user_message))

    insert_metric(pool, Metrics.NUM_LLM_TOKENS_IN.value, llm.get_num_tokens(user_message))

    return messages, available_sources, allowed_chunks, lang_code
