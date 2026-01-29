from langchain.tools import tool

# from src.


@tool
def vectordb_search(query: str) -> str:
    """Searches for documents relevant to the user's query thorugh hybrid-search in a database."""
    retrieved_chunks = None
    # reranker
    return retrieved_chunks
