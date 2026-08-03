import os
import unittest
from datetime import date
from unittest.mock import patch

from langchain_core.documents import Document
from qdrant_client.http.models import Filter

from src.connectors.search import (
    MAX_LIST_RESULTS,
    _day_end,
    _day_start,
    _normalize_text,
    build_files_filter,
    combine_filters,
    list_documents_by_metadata,
)


def make_chunk(doc_id, name, path, modified_time, source="drive", chunk_idx=0):
    return Document(
        page_content="chunk content",
        metadata={
            "id": doc_id,
            "name": name,
            "path": path,
            "authors": ["Autor de Prueba"],
            "mimeType": "application/pdf",
            "modifiedTime": modified_time,
            "webViewLink": f"https://drive.example/{doc_id}",
            "source": source,
            "chunk_idx": chunk_idx,
        },
    )


DOCS = [
    make_chunk("doc-1", "Acta reunión enero.pdf", "Actas/2025/Acta reunión enero.pdf", "2025-01-15T10:00:00.000Z"),
    make_chunk("doc-1", "Acta reunión enero.pdf", "Actas/2025/Acta reunión enero.pdf", "2025-01-15T10:00:00.000Z", chunk_idx=1),
    make_chunk("doc-2", "Acta reunión marzo.pdf", "Actas/2025/Acta reunión marzo.pdf", "2025-03-10T10:00:00.000Z"),
    make_chunk("doc-3", "Acta antigua.pdf", "Actas/2024/Acta antigua.pdf", "2024-06-20T10:00:00.000Z"),
    make_chunk("doc-4", "Presupuesto 2025.xlsx", "Finanzas/Presupuesto 2025.xlsx", "2025-02-01T10:00:00.000Z"),
]


class FakeSource:
    display_name = "Google Drive de prueba"

    def __init__(self, allowed_ids):
        self.allowed_ids = set(allowed_ids)

    def get_permissions_filter(self):
        return Filter()

    def has_access(self, file_id):
        return file_id in self.allowed_ids


class _FakeHit:
    def __init__(self, metadata):
        self.payload = {"metadata": metadata, "page_content": "chunk"}


class _FakeGroup:
    def __init__(self, doc_id, metadata):
        self.id = doc_id
        self.hits = [_FakeHit(metadata)]


class _FakeGroupsResult:
    def __init__(self, groups):
        self.groups = groups


class _FakeQdrantClient:
    def __init__(self, docs):
        self._docs = docs

    def query_points_groups(self, **kwargs):
        # Group chunks by document id, like Qdrant's group_by does
        seen = {}
        for doc in self._docs:
            seen.setdefault(doc.metadata["id"], doc.metadata)
        return _FakeGroupsResult([_FakeGroup(k, v) for k, v in seen.items()])


class _FakeVectorstore:
    collection_name = "documents"

    def __init__(self, docs):
        self.client = _FakeQdrantClient(docs)


def run_listing(docs, sources, **kwargs):
    return list_documents_by_metadata(_FakeVectorstore(docs), sources, **kwargs)


class ListDocumentsTests(unittest.TestCase):
    def setUp(self):
        # Ensure the live permission check path is exercised by default
        os.environ.pop("BENCHMARK", None)
        self.sources = {"drive": FakeSource({"doc-1", "doc-2", "doc-3", "doc-4"})}

    def test_normalize_text_strips_accents_and_case(self):
        self.assertEqual(_normalize_text("Acta Reunión"), "acta reunion")

    def test_query_matches_name_and_path_ignoring_accents(self):
        result = run_listing(DOCS, self.sources, query="acta reunion")

        self.assertEqual([d["id"] for d in result], ["doc-2", "doc-1"])

    def test_query_requires_all_terms(self):
        result = run_listing(DOCS, self.sources, query="acta marzo")

        self.assertEqual([d["id"] for d in result], ["doc-2"])

    def test_empty_query_returns_all_permitted_documents(self):
        result = run_listing(DOCS, self.sources, query="")

        self.assertEqual(len(result), 4)

    def test_chunks_of_same_document_are_deduplicated(self):
        result = run_listing(DOCS, self.sources, query="")

        ids = [d["id"] for d in result]
        self.assertEqual(len(ids), len(set(ids)))

    def test_year_range_filters_by_modified_time(self):
        result = run_listing(
            DOCS,
            self.sources,
            query="acta",
            date_from=date(2025, 1, 1),
            date_to=date(2025, 12, 31),
        )

        self.assertEqual([d["id"] for d in result], ["doc-2", "doc-1"])

    def test_month_range(self):
        result = run_listing(
            DOCS,
            self.sources,
            query="",
            date_from=date(2025, 1, 1),
            date_to=date(2025, 1, 31),
        )

        self.assertEqual([d["id"] for d in result], ["doc-1"])

    def test_results_sorted_by_modified_time_desc(self):
        result = run_listing(DOCS, self.sources, query="acta")

        self.assertEqual([d["id"] for d in result], ["doc-2", "doc-1", "doc-3"])

    def test_live_permission_check_excludes_inaccessible_documents(self):
        sources = {"drive": FakeSource({"doc-1"})}
        result = run_listing(DOCS, sources, query="acta")

        self.assertEqual([d["id"] for d in result], ["doc-1"])

    def test_document_from_unselected_source_is_excluded(self):
        docs = DOCS + [
            make_chunk("doc-5", "Acta dropbox.pdf", "Actas/Acta dropbox.pdf", "2025-04-01T10:00:00.000Z", source="dropbox")
        ]
        result = run_listing(docs, self.sources, query="acta")

        self.assertNotIn("doc-5", [d["id"] for d in result])

    def test_max_results_is_enforced(self):
        result = run_listing(DOCS, self.sources, query="", max_results=2)

        self.assertEqual(len(result), 2)

    def test_max_results_capped_at_limit(self):
        docs = [
            make_chunk(f"doc-{i}", f"Acta {i}.pdf", f"Actas/Acta {i}.pdf", "2025-01-15T10:00:00.000Z")
            for i in range(MAX_LIST_RESULTS + 10)
        ]
        sources = {"drive": FakeSource({f"doc-{i}" for i in range(MAX_LIST_RESULTS + 10)})}
        result = run_listing(docs, sources, query="", max_results=1000)

        self.assertEqual(len(result), MAX_LIST_RESULTS)

    def test_benchmark_mode_skips_live_permission_check(self):
        with patch.dict(os.environ, {"BENCHMARK": "true"}):
            result = run_listing(DOCS, {}, query="acta")

        self.assertEqual(len(result), 3)

    def test_day_bounds(self):
        start = _day_start(date(2025, 3, 15))
        end = _day_end(date(2025, 3, 15))

        self.assertEqual((start.hour, start.minute, start.second), (0, 0, 0))
        self.assertGreater(end, start)
        self.assertEqual((end.year, end.month, end.day), (2025, 3, 15))

    def test_build_files_filter_requires_source_and_id_pairs(self):
        f = build_files_filter([
            {"source": "drive", "id": "doc-1"},
            {"source": "drive", "id": "doc-2"},
        ])

        self.assertIsNotNone(f)
        self.assertEqual(len(f.should), 2)

    def test_build_files_filter_skips_entries_without_id(self):
        self.assertIsNone(build_files_filter([{"source": "drive"}]))
        self.assertIsNone(build_files_filter(None))
        self.assertIsNone(build_files_filter([]))

    def test_combine_filters_and_semantics(self):
        f1 = build_files_filter([{"id": "doc-1"}])
        f2 = Filter()

        self.assertIsNone(combine_filters(None, None))
        self.assertIs(combine_filters(f1, None), f1)
        self.assertEqual(len(combine_filters(f1, f2).must), 2)


if __name__ == "__main__":
    unittest.main()
