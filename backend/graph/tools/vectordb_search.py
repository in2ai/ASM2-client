from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from src.utils.rag import retrieve_and_rerank

# TODO: turn into subgraph


@tool
def vectordb_search(query: str, config: RunnableConfig) -> str:
    """Searches for documents relevant to the user's query through hybrid-search in a database."""

    vectorstore = config["configurable"]["vectorstore"]
    sources = config["configurable"]["sources"]
    reranker = config["configurable"]["reranker"]

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
        sources_summary = ", ".join(available_sources)
        output += f"\n\nAVAILABLE SOURCES: {sources_summary}"

    return output
