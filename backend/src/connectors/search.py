<<<<<<< HEAD
from typing import List
=======
import streamlit as st
>>>>>>> 178d346 (backend restructuring)

from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, Document as QDocument

<<<<<<< HEAD
from src.connectors.source import DataSource
from src.config.config import APPROX_SEARCH_PARAMS
from src.connectors.store import BM25_MODEL


def hybrid_search(vectorstore: Qdrant, sources: List[DataSource], query: str, k: int, prefetch_k: int):
=======
from src.config.config import APPROX_SEARCH_PARAMS
from src.connectors.drive import get_gdrive_qdrant_filter
from src.connectors.dropbox import get_dropbox_qdrant_filter
from src.connectors.onedrive import get_onedrive_qdrant_filter
from src.connectors.store import BM25_MODEL

def get_permission_filter():
    filters = []

    if "gdrive_principals" in st.session_state:
        filters.append(get_gdrive_qdrant_filter(st.session_state.gdrive_principals))

    if "dropbox_principals" in st.session_state:
        filters.append(get_dropbox_qdrant_filter(st.session_state.dropbox_principals))

    if "onedrive_principals" in st.session_state:
        filters.append(get_onedrive_qdrant_filter(st.session_state.onedrive_principals))

    return Filter(should=filters)


def hybrid_search(vectorstore: Qdrant, query: str, k: int, prefetch_k: int):
>>>>>>> 178d346 (backend restructuring)
    # Embed query
    emb = vectorstore.embeddings.embed_query(query)

    # Get permission filter
<<<<<<< HEAD
    pfilter = Filter(should=[i.get_permissions_filter() for i in sources])
=======
    pfilter = get_permission_filter()
>>>>>>> 178d346 (backend restructuring)
    
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