import streamlit as st

from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, SearchParams, Prefetch, Document as QDocument

from src.connectors.drive import get_gdrive_qdrant_filter
from src.connectors.dropbox import get_dropbox_qdrant_filter

def get_permission_filter():
    filters = []

    if "gdrive_principals" in st.session_state:
        filters.append(get_gdrive_qdrant_filter(st.session_state.gdrive_principals))

    if "dropbox_principals" in st.session_state:
        filters.append(get_dropbox_qdrant_filter(st.session_state.dropbox_principals))

    return Filter(should=filters)


def hybrid_search(vectorstore: Qdrant, query: str, k: int, prefetch_k: int):
    # Embed query
    emb = vectorstore.embeddings.embed_query(query)

    # Get permission filter
    pfilter = get_permission_filter()
    
    # Make search request to the server
    search_results = vectorstore.client.query_points(
        collection_name=vectorstore.collection_name,
        query=FusionQuery(fusion=Fusion.RRF),
        prefetch=[
            Prefetch(query=emb, using="embedding", limit=prefetch_k, filter=pfilter),
            Prefetch(query=QDocument(text=query, model="qdrant/bm25"), using="bm25", limit=prefetch_k, filter=pfilter)
        ],
        search_params=SearchParams(hnsw_ef=256, exact=False),
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