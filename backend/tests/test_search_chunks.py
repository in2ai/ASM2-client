from langchain_core.documents import Document

from src.config.search_config import PREV_CHUNKS
from src.connectors.search import (
    build_contiguous_chunk_filter,
    join_contiguous_chunks,
    split_contiguous,
)


def _doc(content: str, start_index: int, chunk_idx: int) -> Document:
    return Document(
        page_content=content,
        metadata={"start_index": start_index, "chunk_idx": chunk_idx, "id": "doc-1"},
    )


def test_split_contiguous_groups_consecutive_numbers():
    assert split_contiguous([1, 2, 3, 7, 8, 10]) == [[1, 2, 3], [7, 8], [10]]
    assert split_contiguous([5]) == [[5]]


def test_build_contiguous_chunk_filter_clamps_start_to_zero():
    chunk_filter = build_contiguous_chunk_filter([("doc-1", 0)], num_previous=2, num_next=2)

    assert len(chunk_filter.should) == 1
    range_condition = chunk_filter.should[0].must[1]
    assert range_condition.range.gte == 0
    assert range_condition.range.lte == 2


def test_join_contiguous_chunks_trims_overlap():
    docs = [
        _doc("abcdef", start_index=0, chunk_idx=0),
        _doc("efghij", start_index=4, chunk_idx=1),
        _doc("ijklmn", start_index=8, chunk_idx=2),
    ]

    joined = join_contiguous_chunks(docs)

    assert joined.page_content == "abcdefghijklmn"
    assert joined.metadata is docs[min(PREV_CHUNKS, len(docs) - 1)].metadata


def test_join_contiguous_chunks_single_chunk_group():
    # Regression test: groups shorter than PREV_CHUNKS + 1 (single-chunk
    # documents, anchors at the start of a document) must not raise IndexError.
    docs = [_doc("only chunk", start_index=0, chunk_idx=0)]

    joined = join_contiguous_chunks(docs)

    assert joined.page_content == "only chunk"
    assert joined.metadata is docs[0].metadata
