import unicodedata
from datetime import datetime, timezone

from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http.models import Filter
from qdrant_client.http.models import Fusion, FusionQuery, Prefetch, FieldCondition, MatchValue, Range, Document as QDocument

from src.config.env import get_bool_env
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


# ---------------------------------
# Document listing by metadata
# ---------------------------------

MAX_LIST_RESULTS = 50


def _normalize_text(text: str) -> str:
    """Lowercase and strip accents so queries match titles/paths loosely."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _parse_date_bound(value: str, is_end: bool) -> datetime:
    """Parse a lenient date bound: '2025', '2025-03' or full ISO date/datetime.

    Start bounds default to the earliest instant of the period, end bounds to
    the latest, so '2025' as date_to covers the whole year.
    """
    value = value.strip()
    parts = value.split("-")

    if len(parts) == 1 and parts[0].isdigit() and len(parts[0]) == 4:
        if is_end:
            return datetime(int(parts[0]), 12, 31, 23, 59, 59, tzinfo=timezone.utc)
        return datetime(int(parts[0]), 1, 1, tzinfo=timezone.utc)

    if len(parts) == 2 and all(p.isdigit() for p in parts):
        year, month = int(parts[0]), int(parts[1])
        if is_end:
            if month == 12:
                return datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
            return datetime(year, month + 1, 1, tzinfo=timezone.utc)
        return datetime(year, month, 1, tzinfo=timezone.utc)

    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _parse_modified_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def list_documents_by_metadata(
    vectorstore: Qdrant,
    sources: dict[str, DataSource] | None = None,
    query: str = "",
    date_from: str | None = None,
    date_to: str | None = None,
    max_results: int = 20,
) -> list[dict]:
    """List distinct indexed documents matching metadata criteria.

    Applies the same two-layer permission model as retrieval: a Qdrant
    payload filter on the indexed ACLs, then a live `has_access` check per
    candidate document against the source (skipped in benchmark mode).
    """
    max_results = max(1, min(int(max_results), MAX_LIST_RESULTS))

    query_terms = [t for t in _normalize_text(query).split() if t]
    start = _parse_date_bound(date_from, is_end=False) if date_from else None
    end = _parse_date_bound(date_to, is_end=True) if date_to else None

    # Scroll the whole (permission-filtered) collection and keep one
    # representative metadata record per document id.
    pfilter = get_permission_filter(sources)
    documents: dict[str, dict] = {}

    for _, doc in iterate_qdrant_docs(vectorstore, scroll_filter=pfilter):
        meta = doc.metadata
        doc_id = meta.get("id")

        if not doc_id or doc_id in documents:
            continue

        haystack = _normalize_text(f'{meta.get("name", "")} {meta.get("path", "")}')

        if query_terms and not all(t in haystack for t in query_terms):
            continue

        modified = _parse_modified_time(meta.get("modifiedTime"))

        if start and (modified is None or modified < start):
            continue

        if end and (modified is None or modified > end):
            continue

        documents[doc_id] = {
            "id": doc_id,
            "title": meta.get("title") or meta.get("name") or "(sin titulo)",
            "path": meta.get("path", ""),
            "authors": meta.get("authors", []),
            "mimeType": meta.get("mimeType"),
            "modifiedTime": meta.get("modifiedTime"),
            "link": meta.get("webViewLink"),
            "source": meta.get("source"),
            "_modified": modified or datetime.min.replace(tzinfo=timezone.utc),
        }

    # Most recently modified first
    candidates = sorted(documents.values(), key=lambda d: d["_modified"], reverse=True)

    # Live permission check per candidate, same as retrieve_and_rerank
    allowed = []
    check_live = not get_bool_env("BENCHMARK")

    for doc in candidates:
        if check_live:
            source = sources.get(doc["source"]) if sources else None

            if source is None or not source.has_access(doc["id"]):
                continue

        doc.pop("_modified")
        allowed.append(doc)

        if len(allowed) >= max_results:
            break

    return allowed
