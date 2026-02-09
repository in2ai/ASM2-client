from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from model import llm
from src.utils.rag import retrieve_and_rerank

# TODO: turn into subgraph


@tool
def vectordb_search(query: str, config: RunnableConfig) -> str:
    """Searches for documents relevant to the user's query thorugh hybrid-search in a database."""

    vectorstore = config["configurable"]["vectorstore"]
    sources = config["configurable"]["sources"]
    reranker = config["configurable"]["reranker"]
    questdb_pool = config["configurable"]["questdb_pool"]

    messages, available_sources, chunks, lang_code = retrieve_and_rerank(
        query, questdb_pool, vectorstore, reranker, sources
    )

    # structured_llm = llm.with_structured_output(RAGResponse)
    # response: RAGResponse = structured_llm.invoke(messages)

    if not chunks:
        fallback_messages = {
            "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
            "en": "I couldn't find relevant information about that topic in the available sources.",
            "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
        }

        return fallback_messages[lang_code]

    result = []
    for chunk in chunks:
        meta = chunk.metadata
        result.append(
            f"**{meta.get('title', 'Untitled')}**\n"
            f"Source: {meta.get('source', 'Unknown')}\n"
            f"Link: {meta.get('webViewLink', 'N/A')}\n"
            f"{chunk.page_content[:1500]}\n"
        )

    return "\n---\n".join(result)
