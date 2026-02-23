import logging

from langchain.tools import tool
from langchain_core.runnables import RunnableConfig

from src.connectors.store import QDRANT_PATH
from src.metrics.metrics import (
    Metrics,
    TimedMetric,
    insert_metric,
    register_topics,
    register_words,
)
from src.utils.nlp import extract_search_terms
from src.utils.rag import retrieve_and_rerank
from src.utils.topic import resolve_topic_names


@tool
def vectordb_search(query: str, config: RunnableConfig) -> str:
    """Searches for documents relevant to the user's query through hybrid-search in a database."""

    configurable = config.get("configurable", {})
    vectorstore = configurable["vectorstore"]
    sources = configurable["sources"]
    reranker = configurable["reranker"]
    pool = configurable.get("questdb_pool")

    try:
        with TimedMetric(pool, Metrics.DOC_RESPONSE_TIME.value):
            chunks, available_sources, lang_code = retrieve_and_rerank(
                query, vectorstore, reranker, sources
            )

    except Exception:
        logging.exception("vectordb_search failed")
        return "[Search error: the document search is temporarily unavailable.]"

    try:
        insert_metric(pool, Metrics.NUM_DOCS_RAG.value, len(chunks))

    except Exception:
        logging.warning("Failed to record NUM_DOCS_RAG metric", exc_info=True)

    try:
        search_terms = extract_search_terms(query, lang_code)
        register_words(pool, search_terms, lang_code)

    except Exception:
        logging.warning("Failed to record search terms", exc_info=True)

    try:
        topic_indices = {t for c in chunks for t in c.metadata.get("topics", {})}

        if topic_indices:
            topics = resolve_topic_names(topic_indices, lang_code, QDRANT_PATH)
            register_topics(pool, topics)

    except Exception:
        logging.warning("Failed to record topics", exc_info=True)

    # --- Build response ---
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
