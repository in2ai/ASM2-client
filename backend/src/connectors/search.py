from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, Document as QDocument

from src.config.search_config import APPROX_SEARCH_PARAMS
from src.connectors.source import DataSource
from src.connectors.store import BM25_MODEL


def get_permission_filter(sources: dict[str, DataSource] | None = None):
    if not sources:
        return None

    filters = [source.get_permissions_filter() for source in sources.values()]
    return Filter(should=filters) if filters else None


def hybrid_search(
    vectorstore: Qdrant,
    query: str,
    k: int,
    prefetch_k: int,
    sources: dict[str, DataSource] | None = None,
):
    # Embed query
    emb = vectorstore.embeddings.embed_query(query)

    # Get permission filter
    pfilter = get_permission_filter(sources)

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
