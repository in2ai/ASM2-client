from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from typing import Optional, List

from pydantic import BaseModel, Field
from typing import Dict, Optional
from sentence_transformers import CrossEncoder
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.connectors.source import DataSource
from src.connectors.store import QDRANT_META_PATH
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


def _resolve_source_label(source_key: str, sources: Dict[str, DataSource]) -> str:
    source = sources.get(source_key)
    if source is not None and getattr(source, "display_name", ""):
        return source.display_name
    return source_key or "Unknown"

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
        (allowed_chunks, lang_code)
    """
    lang_code = detect_language(query)

    # Perform hybrid search
    search_results = hybrid_search(vectordb, query, 25, 25, sources)

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

    return allowed_chunks, lang_code


def get_chunk_sources(chunks, sources):
    available_sources = {}

    for d in chunks:
        doc_id = d.metadata.get("id")

        if doc_id not in available_sources:
            tag = _resolve_source_label(d.metadata.get("source", "Unknown"), sources)
            title = d.metadata.get("title") or d.metadata.get("name") or "(sin titulo)"
            link = d.metadata.get("webViewLink")

            available_sources[doc_id] = {"title": title, "source_type": tag, "link": link}

        page = d.metadata.get('page')

        if page is not None:
            available_sources[doc_id].setdefault('pages', set()).add(page)

    for v in available_sources.values():
        if 'pages' in v:
            v['pages'] = sorted(v['pages'])

    return list(available_sources.values())


def get_rag_system_prompt(lang_code: str) -> str:
    """Build the RAG system prompt with the detected language."""
    return (
        "You are a RAG conversational assistant. Use the available search tools when the user needs information from connected documents. "
        "Respond EXCLUSIVELY in the language of the last message of the user, "
        f"which has been detected to have the following language code: {lang_code}. "
        "When you use retrieved context, answer only with information supported by it and do not improvise. "
        'In your response, do not use the word "CONTEXT", instead use "the sources". '
        "Write in natural, clear, and direct language. "
        "If the message is a greeting, thanks, or casual conversation that does not require document retrieval, reply naturally without mentioning sources or calling tools. "
        "Use the conversation history to follow the thread. "
        "When calling search tools, always formulate the query argument as a fully "
        "self-contained search query. Resolve any pronouns, demonstratives, or "
        "conversational references (e.g. 'it', 'that', 'those', 'the same thing', "
        "'more about that') by replacing them with the specific terms from the "
        "conversation context, so the search query is understandable without "
        "prior conversation."
        "Do not add any references or links to online resources, just answer using the context."
    )


class SourceValidity(BaseModel):
    is_relevant: bool
    reason: str


def is_relevant_source(llm, query, chunk):
    # LLM with function call
    llm_judge = llm.with_structured_output(SourceValidity)

    # Prompt
    system = """
    You are a answer-presence classifier for RAG.

    Given:
    1) a user question
    2) a retrieved text chunk

    Decide whether the chunk contains the answer or a necessary part of the answer.

    Mark is_relevant = true ONLY if:
    - the chunk directly answers the question, OR
    - it contains a specific fact, detail, or evidence that clearly contributes to the answer

    Mark is_relevant = false if:
    - the chunk is only generally related but does not contain the answer
    - it is vague, background information, or tangential
    - the connection to the answer requires significant inference

    Be strict. If the answer (or part of it) is not explicitly present, return false.
    """

    user = f"""
    Query:
    {query}

    Chunk:
    {chunk}
    """

    ans = llm_judge.invoke([SystemMessage(content=system), HumanMessage(content=user)])

    return ans
