from concurrent.futures import ThreadPoolExecutor
import logging
import os
from typing import Annotated

from treedex import TreeDex
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState

from src.generation.artifact import build_document_artifact
from src.generation.llm import InsufficientContextError, generate_document_from_context
from src.generation.model import DocumentGenerationSchema
from src.config.env import get_env, get_bool_env
from src.connectors.store import QDRANT_META_PATH
from src.connectors.search import augment_chunks, merge_sources
from src.connectors.llms import get_configured_long_context_llm
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


@tool(response_format="content_and_artifact")
def vectordb_search(query: str, config: RunnableConfig) -> tuple[str, dict]:
    """Searches for documents relevant to the user's query through hybrid-search in a database."""

    logging.info(f'Searching: {query}')

    configurable = config.get("configurable", {})
    llm = configurable["llm"]
    vectorstore = configurable["vectorstore"]
    sources = configurable["sources"]
    reranker = configurable["reranker"]
    pool = configurable.get("pg_pool")
    metrics_actor = configurable.get("metrics_actor")

    # Perform VDB search
    try:
        with TimedMetric(pool, Metrics.DOC_RESPONSE_TIME.value, actor=metrics_actor):
            chunks, lang_code = retrieve_and_rerank(
                query, vectorstore, reranker, sources
            )

    except Exception:
        logging.exception("vectordb_search failed")
        return "[Search error: the document search is temporarily unavailable.]", {"sources": []}

    USE_LONG_CONTEXT_BEFORE = get_bool_env('LONG_CONTEXT_BEFORE_FILTER')

    if USE_LONG_CONTEXT_BEFORE:
        long_context_sources = get_chunk_sources(chunks, sources)

    # Filter sources with LLM
    def check_chunk(c):
        return is_relevant_source(llm, query, c.page_content).is_relevant

    with ThreadPoolExecutor() as executor:
        relevance = list(executor.map(check_chunk, chunks))

    chunks = [c for c, ok in zip(chunks, relevance) if ok]
    available_sources = get_chunk_sources(chunks, sources)

    logging.info(f'Found {len(chunks)} relevant chunks')

    if not USE_LONG_CONTEXT_BEFORE:
        long_context_sources = available_sources

    USE_LONG_CONTEXT = get_bool_env('LONG_CONTEXT')
    long_context = []
    long_context_used = []

    if USE_LONG_CONTEXT:
        lc_llm = get_configured_long_context_llm(llm)

        for source in long_context_sources:
            treedex_path = QDRANT_META_PATH + f'/treedex/{source["id"]}.json'

            if os.path.isfile(treedex_path):
                logging.info(f"Checking long context for {source['title']}")
                index = TreeDex.load(treedex_path, llm=lc_llm)
                result = index.query(query, agentic=True)

                header = f'[Long context summary for {source["title"]}]'
                long_context.append(f'{header}\n\n{result}')
                long_context_used.append(source)

    # Send usage metrics
    if pool is not None and metrics_actor is not None:
        try:
            insert_metric(
                pool, Metrics.NUM_DOCS_RAG.value, len(chunks), actor=metrics_actor
            )

        except Exception:
            logging.warning("Failed to record NUM_DOCS_RAG metric", exc_info=True)

        try:
            search_terms = extract_search_terms(query, lang_code)
            register_words(pool, search_terms, actor=metrics_actor, lang=lang_code)

        except Exception:
            logging.warning("Failed to record search terms", exc_info=True)

        try:
            topic_indices = {t for c in chunks for t in c.metadata.get("topics", {})}

            if topic_indices:
                topics = resolve_topic_names(topic_indices, lang_code, QDRANT_META_PATH)
                register_topics(pool, topics, actor=metrics_actor)

        except Exception:
            logging.warning("Failed to record topics", exc_info=True)

    # Build response
    fallback_messages = {
        "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
        "en": "I couldn't find relevant information about that topic in the available sources.",
        "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
    }

    formatted_chunks = []

    for chunk in (augment_chunks(vectorstore, chunks) if chunks else []):
        meta = chunk.metadata
        header = (
            '['
            f'file: {meta["path"]}; '
            f'authors: {", ".join(meta["authors"])}; '
            f'date: {meta["modifiedTime"]}; '
            f'page {meta.get("page", "None")}'
            ']'
        )

        formatted_chunks.append(f'{header}\n\n{chunk.page_content}')

    blocks = formatted_chunks + long_context

    if not blocks:
        return fallback_messages.get(lang_code, fallback_messages["es"]), {"sources": []}

    cited_sources = merge_sources(available_sources, long_context_used)

    return "\n\n".join(blocks), {"sources": cited_sources}


@tool(args_schema=DocumentGenerationSchema, response_format="content_and_artifact")
def generate_document(
        query: str,
        format: str,
        config: RunnableConfig,
        messages: Annotated[list, InjectedState("messages")]
    ) -> tuple[str, dict | None]:
    """
    Generates a document following user instructions.
    Should be done before any vectordb_search call, this tool will suggest search terms if needed.
    Unless stated otherwise, generate a PDF by default.
    """

    logging.info("Generating document...")

    # Get config
    configurable = config.get("configurable", {})
    llm = configurable["llm"]

    # Generate document
    try:
        document = generate_document_from_context(llm, query, messages)

    except InsufficientContextError as e:
        searches = "\n".join(f"- {q}" for q in e.suggested_searches)
        return (
            "Not enough information in the current context to generate this document.\n"
            f"Missing: {e.missing_info}\n"
            "Run vectordb_search separately for each of these queries, then call generate_document again:\n"
            f"{searches}",
            None,
        )

    # Render document
    try:
        artifact = build_document_artifact(document, format)

    except ValueError:
        logging.exception("Document rendering failed")
        return (
            f"The '{format}' format is not supported. Supported formats: pdf, markdown, txt.",
            None,
        )

    return (
        f'Generated the {format} document "{document.title}". '
        "It is attached to the reply so the user can download it; "
        "tell them it is ready instead of repeating its full contents.",
        artifact,
    )
