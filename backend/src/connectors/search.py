from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, FieldCondition, MatchValue, Range, Document as QDocument

from src.config.search_config import APPROX_SEARCH_PARAMS
from src.connectors.source import DataSource
from src.connectors.store import BM25_MODEL, iterate_qdrant_docs


def get_permission_filter(sources: dict[str, DataSource] | None = None):
    if not sources:
        return None

    filters = [source.get_permissions_filter() for source in sources.values()]
    return Filter(should=filters) if filters else None


def build_contiguous_chunk_filter(anchors: list[tuple[str, int]], num_previous: int, num_next: int) -> Filter:
    should_filters: list[Filter] = []

    for doc_id, chunk_idx in anchors:
        start = max(0, chunk_idx - num_previous)
        end = chunk_idx + num_next

        should_filters.append(
            Filter(
                must=[
                    FieldCondition(
                        key="metadata.id",
                        match=MatchValue(value=doc_id),
                    ),
                    FieldCondition(
                        key="metadata.chunk_idx",
                        range=Range(gte=start, lte=end),
                    ),
                ]
            )
        )

    return Filter(should=should_filters)


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

    # Filter by anchor index
    anchors = [
        (d.payload['metadata']['id'], d.payload['metadata']['chunk_idx']) 
        for d in search_results.points
    ]

    contiguous_filter = build_contiguous_chunk_filter(anchors, 1, 2)
    search_results = iterate_qdrant_docs(vectorstore, scroll_filter=contiguous_filter)
    res = [d for _, d in search_results]

    return res
