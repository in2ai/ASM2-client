from langchain.tools import tool
from langchain_core.runnables import RunnableConfig

from src.utils.rag import retrieve_and_rerank


@tool
def vectordb_search(query: str, config: RunnableConfig) -> str:
    """Searches for documents relevant to the user's query through hybrid-search in a database.

    Use this tool whenever the user asks a question that may require information
    from their connected documents. The tool performs hybrid search (vector + BM25),
    filters by permissions, and reranks the results.

    Args:
        query: The search query to find relevant documents.
    """
    vectorstore = config["configurable"]["vectorstore"]
    sources = config["configurable"]["sources"]
    reranker = config["configurable"]["reranker"]

    try:
        chunks, available_sources, lang_code = retrieve_and_rerank(
            query, vectorstore, reranker, sources
        )
    except Exception as e:
        return (
            f"Error searching documents: {e}. "
            "Please try rephrasing your query or try again later."
        )

    if not chunks:
        fallback_messages = {
            "es": "No encontre informacion relevante sobre ese tema en las fuentes disponibles.",
            "en": "I couldn't find relevant information about that topic in the available sources.",
            "gl": "Non atopei informacion relevante sobre ese tema nas fontes disponibles.",
        }
        return fallback_messages.get(lang_code, fallback_messages["en"])

    # Return structured context for the agent
    result = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.metadata
        title = meta.get("title") or meta.get("name") or "Untitled"
        source_type = meta.get("source", "Unknown")
        link = meta.get("webViewLink", "N/A")
        content = (chunk.page_content or "")[:1500]

        result.append(
            f"[Source {i}]\n"
            f"Title: {title}\n"
            f"Type: {source_type}\n"
            f"Link: {link}\n"
            f"Content: {content}\n"
            f"---"
        )

    # Append available sources summary for citation
    sources_summary = "\n".join(
        f"- {s['title']} ({s['source_type']}) - Link: {s.get('link') or 'N/A'}"
        for s in available_sources
    )

    return "\n".join(result) + f"\n\nAVAILABLE SOURCES:\n{sources_summary}"
