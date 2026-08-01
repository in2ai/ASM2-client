import os
import unittest
from unittest.mock import patch

from langchain_core.documents import Document
from qdrant_client.http.models import Filter

from src.connectors.search import (
    MAX_LIST_RESULTS,
    _normalize_text,
    _parse_date_bound,
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


def run_listing(docs, sources, **kwargs):
    with patch(
        "src.connectors.search.iterate_qdrant_docs",
        return_value=iter([(f"point-{i}", d) for i, d in enumerate(docs)]),
    ):
        return list_documents_by_metadata(object(), sources, **kwargs)


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
            DOCS, self.sources, query="acta", date_from="2025", date_to="2025"
        )

        self.assertEqual([d["id"] for d in result], ["doc-2", "doc-1"])

    def test_month_range(self):
        result = run_listing(
            DOCS, self.sources, query="", date_from="2025-01", date_to="2025-01"
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

    def test_parse_date_bound_year(self):
        start = _parse_date_bound("2025", is_end=False)
        end = _parse_date_bound("2025", is_end=True)

        self.assertEqual((start.year, start.month, start.day), (2025, 1, 1))
        self.assertEqual((end.year, end.month, end.day), (2025, 12, 31))


if __name__ == "__main__":
    unittest.main()
