from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from src.utils.rag import retrieve_and_rerank
from tools.query_rewrite import rewrite_query_if_needed

# TODO: turn into subgraph


@tool
def vectordb_search(query: str, config: RunnableConfig) -> str:
    """Searches for documents relevant to the user's query through hybrid-search in a database."""

    configurable = config.get("configurable", {})
    vectorstore = configurable["vectorstore"]
    sources = configurable["sources"]
    reranker = configurable["reranker"]

    # Rewrite ambiguous queries using conversation context
    conversation_history = configurable.get("conversation_history", [])
    query = rewrite_query_if_needed(query, conversation_history)

    try:
        chunks, available_sources, lang_code = retrieve_and_rerank(
            query, vectorstore, reranker, sources
        )
    except Exception as e:
        return f"[Search error: {e}]"

    fallback_messages = {
        "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
        "en": "I couldn't find relevant information about that topic in the available sources.",
        "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
    }

    if not chunks:
        return fallback_messages.get(lang_code, fallback_messages["es"])

    result = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.metadata
        result.append(
            f"[{i}] {meta.get('title', 'Untitled')}\n"
            f"Source: {meta.get('source', 'Unknown')}\n"
            f"Link: {meta.get('webViewLink', 'N/A')}\n"
            f"{chunk.page_content[:1500]}"
        )

    output = "\n---\n".join(result)

    if available_sources:
        sources_lines = []
        for source in available_sources:
            title = source.get("title", "Untitled")
            source_type = source.get("source_type", "Unknown")
            link = source.get("link") or "N/A"
            sources_lines.append(f"- type: {source_type}, title: {title}, link: {link}")
        output += "\n\nAVAILABLE SOURCES:\n" + "\n".join(sources_lines)

    return output
