from concurrent.futures import ThreadPoolExecutor
import logging

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from src.connectors.store import QDRANT_META_PATH
from src.connectors.search import augment_chunks
from src.metrics.metrics import (
    Metrics,
    TimedMetric,
    insert_metric,
    register_topics,
    register_words,
)
from src.utils.nlp import extract_search_terms
from src.utils.rag import retrieve_and_rerank, is_relevant_source, get_chunk_sources
from src.utils.topic import resolve_topic_names


@tool
def vectordb_search(query: str, config: RunnableConfig) -> str:
    """Searches for documents relevant to the user's query through hybrid-search in a database."""

    configurable = config.get("configurable", {})
    llm = configurable["llm"]
    vectorstore = configurable["vectorstore"]
    sources = configurable["sources"]
    reranker = configurable["reranker"]
    pool = configurable.get("questdb_pool")

    # Perform VDB search
    try:
        with TimedMetric(pool, Metrics.DOC_RESPONSE_TIME.value):
            chunks, lang_code = retrieve_and_rerank(
                query, vectorstore, reranker, sources
            )

    except Exception:
        logging.exception("vectordb_search failed")
        return "[Search error: the document search is temporarily unavailable.]"
    
    # Filter sources with LLM
    def check_chunk(c):
        return is_relevant_source(llm, query, c.page_content).is_relevant

    with ThreadPoolExecutor() as executor:
        relevance = list(executor.map(check_chunk, chunks))

    chunks = [c for c, ok in zip(chunks, relevance) if ok]
    available_sources = get_chunk_sources(chunks, sources)

    # Send usage metrics
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
            topics = resolve_topic_names(topic_indices, lang_code, QDRANT_META_PATH)
            register_topics(pool, topics)

    except Exception:
        logging.warning("Failed to record topics", exc_info=True)

    # Build response
    fallback_messages = {
        "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
        "en": "I couldn't find relevant information about that topic in the available sources.",
        "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
    }

    if not chunks:
        return fallback_messages.get(lang_code, fallback_messages["es"])

    formatted_chunks = []

    for chunk in augment_chunks(vectorstore, chunks):
        meta = chunk.metadata
        header = (
            '['
            f'file: {meta["path"]}; '
            f'authors: {", ".join(meta["authors"])}; '
            f'date: {meta["modifiedTime"]}; '
            f'page {meta["page"]}'
            ']'
        )

        formatted_chunks.append(f'{header}\n\n{chunk.page_content}')

    return {
        "chunks": formatted_chunks,
        "sources": available_sources
    }
