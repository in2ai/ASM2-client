from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, Document as QDocument

from src.config.search_config import APPROX_SEARCH_PARAMS
from src.connectors.store import BM25_MODEL


def get_permission_filter(principals: dict = None):
    """Build a Qdrant permission filter from principals dict.

    Args:
        principals: Dict with optional keys 'gdrive_principals', 'dropbox_principals',
                    'onedrive_principals'. If None, falls back to st.session_state
                    for backwards compatibility with the Streamlit app.
    """
    if principals is None:
        try:
            import streamlit as st
            principals = {
                "gdrive_principals": st.session_state.get("gdrive_principals"),
                "dropbox_principals": st.session_state.get("dropbox_principals"),
                "onedrive_principals": st.session_state.get("onedrive_principals"),
            }
        except Exception:
            principals = {}

    filters = []

    if principals.get("gdrive_principals"):
        from src.connectors.drive import get_gdrive_qdrant_filter
        filters.append(get_gdrive_qdrant_filter(principals["gdrive_principals"]))

    if principals.get("dropbox_principals"):
        from src.connectors.dropbox import get_dropbox_qdrant_filter
        filters.append(get_dropbox_qdrant_filter(principals["dropbox_principals"]))

    if principals.get("onedrive_principals"):
        from src.connectors.onedrive import get_onedrive_qdrant_filter
        filters.append(get_onedrive_qdrant_filter(principals["onedrive_principals"]))

    return Filter(should=filters)


def hybrid_search(vectorstore: Qdrant, query: str, k: int, prefetch_k: int, principals: dict = None):
    # Embed query
    emb = vectorstore.embeddings.embed_query(query)

    # Get permission filter
    pfilter = get_permission_filter(principals)

    # Make search request to the server
    search_results = vectorstore.client.query_points(
        collection_name=vectorstore.collection_name,
        query=FusionQuery(fusion=Fusion.RRF),
        prefetch=[
            Prefetch(query=emb, using="embedding", limit=prefetch_k, filter=pfilter),
            Prefetch(query=QDocument(text=query, model=BM25_MODEL), using="bm25", limit=prefetch_k, filter=pfilter)
        ],
        search_params=APPROX_SEARCH_PARAMS,
        with_payload=True,
        with_vectors=False,
        limit=k,
    )

    # Transform to langchain's Document model
    res = [
        Document(page_content=d.payload['page_content'], metadata=d.payload['metadata'])
        for d in search_results.points
    ]

    return res
