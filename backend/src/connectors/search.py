from typing import List

from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, Document as QDocument

from src.connectors.source import DataSource
from src.config.config import APPROX_SEARCH_PARAMS
from src.connectors.store import BM25_MODEL


def hybrid_search(vectorstore: Qdrant, sources: List[DataSource], query: str, k: int, prefetch_k: int):
    # Embed query
    emb = vectorstore.embeddings.embed_query(query)

    # Get permission filter
    pfilter = Filter(should=[i.get_permissions_filter() for i in sources])
    
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