import logging
from typing import NamedTuple

from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, FieldCondition, MatchValue, Range, Document as QDocument

from src.config.env import get_bool_env
from src.config.search_config import APPROX_SEARCH_PARAMS, IMAGE_NEIGHBOR_PAGES, IMAGE_SEARCH_PARAMS, IMAGE_TOP_K, PREV_CHUNKS, NEXT_CHUNKS
from src.connectors.image_store import has_image
from src.connectors.source import DataSource
from src.connectors.store import BM25_MODEL, QDRANT_IMG_COL, iterate_qdrant_docs


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


def split_contiguous(nums):
    res = [[nums[0]]]

    for n in nums[1:]:
        if n == res[-1][-1] + 1:
            res[-1].append(n)

        else:
            res.append([n])
    
    return res


def augment_chunks(vectorstore: Qdrant, chunks: list[Document]):
    # Get all chunks from VDB
    anchors = [(d.metadata['id'], d.metadata['chunk_idx']) for d in chunks]

    contiguous_filter = build_contiguous_chunk_filter(anchors, PREV_CHUNKS, NEXT_CHUNKS)
    search_results = iterate_qdrant_docs(vectorstore.client, vectorstore.collection_name, scroll_filter=contiguous_filter)

    # Classify chunks by file
    doc_chunks = {} 

    for _, d in search_results:
        file_id = d.metadata['id']
        chunk_id = d.metadata['chunk_idx']

        doc_chunks.setdefault(file_id, {})
        doc_chunks[file_id][chunk_id] = d

    # Get sorted chunks
    res = []

    for chunks in doc_chunks.values():
        idxs = sorted(chunks.keys())

        for group in split_contiguous(idxs):
            res.append([chunks[i] for i in group])

    # Join chunks
    res = [join_contiguous_chunks(i) for i in res]

    return res


def join_contiguous_chunks(docs):
    result = []
    last_end = 0

    for doc in docs:
        start = doc.metadata["start_index"]
        content = doc.page_content

        # compute overlap relative to previous chunk
        overlap = max(0, last_end - start)

        result.append(content[overlap:])
        last_end = start + len(content)

    chunk_idx = min(PREV_CHUNKS, len(docs) - 1)

    return Document(
        page_content="".join(result),
        metadata=docs[chunk_idx].metadata # Take central chunk
    )


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
            Prefetch(query=emb, using="embedding", limit=prefetch_k, params=APPROX_SEARCH_PARAMS, filter=pfilter),
            Prefetch(query=QDocument(text=query, model=BM25_MODEL), using="bm25", limit=prefetch_k, params=APPROX_SEARCH_PARAMS, filter=pfilter)
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

    contiguous_filter = build_contiguous_chunk_filter(anchors, PREV_CHUNKS, NEXT_CHUNKS)
    search_results = iterate_qdrant_docs(vectorstore.client, vectorstore.collection_name, scroll_filter=contiguous_filter)
    res = [d for _, d in search_results]

    return res


class ImageHit(NamedTuple):
    """A page retrieved by the visual search: a reference, not bytes.
    
    On neighbors (`is_anchor=False`) `score` is inherited from their anchor.
    """

    file_id: str
    page: int
    score: float
    metadata: dict
    is_anchor: bool = True


def visual_search(
    client,
    image_embedder,
    query: str,
    k: int = IMAGE_TOP_K,
    sources: dict[str, DataSource] | None = None,
) -> list[ImageHit]:
    """Retrieve the pages most relevant to the query through MaxSim."""
    # Embed query
    emb = image_embedder.embed_query(query)

    # Get Qdrant permission filter
    qfilter = get_permission_filter(sources)

    # Filter by Drive permissions
    access_cache: dict[str, bool] = {}

    def has_live_access(metadata) -> bool:
        if not sources or get_bool_env("BENCHMARK"):
            return True

        file_id = metadata["id"]

        if file_id not in access_cache:
            source = metadata.get("source")
            access_cache[file_id] = (
                source in sources and sources[source].has_access(file_id)
            )

        return access_cache[file_id]

    # Make search request to the server
    search_results = client.query_points(
        collection_name=QDRANT_IMG_COL,
        query=emb,
        using="embedding",
        query_filter=qfilter,
        search_params=IMAGE_SEARCH_PARAMS,
        with_payload=True,
        with_vectors=False,
        limit=k,
    )

    # Load images from disk
    anchors = []

    for point in search_results.points:
        metadata = point.payload["metadata"]
        file_id = metadata["id"]
        page = metadata["page"]

        if not has_live_access(metadata):
            logging.info(
                "Live permission check rejected file %s; skipping page %s",
                file_id,
                page,
            )
            continue

        if not has_image(file_id, page):
            logging.warning(
                "Image missing on disk for file %s page %s; skipping",
                file_id,
                page,
            )
            continue

        anchors.append(
            ImageHit(
                file_id=file_id,
                page=page,
                score=point.score,
                metadata=metadata,
            )
        )

    # Neighbor expansion
    res = list(anchors)
    seen = {(a.file_id, a.page) for a in anchors}

    for anchor in anchors:
        for offset in range(-IMAGE_NEIGHBOR_PAGES, IMAGE_NEIGHBOR_PAGES + 1):
            page = anchor.page + offset

            if offset == 0 or page < 1 or (anchor.file_id, page) in seen:
                continue

            if not has_image(anchor.file_id, page):
                continue

            seen.add((anchor.file_id, page))

            res.append(
                ImageHit(
                    file_id=anchor.file_id,
                    page=page,
                    score=anchor.score,
                    metadata={**anchor.metadata, "page": page},
                    is_anchor=False,
                )
            )

    return res