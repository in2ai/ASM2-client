from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, FieldCondition, MatchValue, Range, Document as QDocument

from src.config.search_config import APPROX_SEARCH_PARAMS, PREV_CHUNKS, NEXT_CHUNKS
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
    search_results = iterate_qdrant_docs(vectorstore, scroll_filter=contiguous_filter)

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

    return Document(
        page_content="".join(result),
        metadata=docs[PREV_CHUNKS].metadata # Take central chunk
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
    search_results = iterate_qdrant_docs(vectorstore, scroll_filter=contiguous_filter)
    res = [d for _, d in search_results]

    return res
