import unittest

from src.indexing.deletion_guard import (
    DeletionThresholdExceeded,
    assess_cloud_deletions,
    enforce_deletion_guard,
    enforce_sources_deletion_guard,
)


class DeletionGuardTests(unittest.TestCase):
    def test_blocks_when_deletions_equal_threshold(self):
        impact = assess_cloud_deletions(
            source="drive",
            indexed_document_ids={"a", "b", "c", "d", "e"},
            cloud_document_ids={"c", "d", "e"},
            threshold_percentage=40,
        )

        self.assertIsNotNone(impact)
        self.assertEqual(impact.deleted_documents, 2)
        self.assertEqual(impact.total_documents, 5)
        self.assertEqual(impact.percentage, 40)

    def test_allows_deletions_below_threshold(self):
        impact = assess_cloud_deletions(
            source="drive",
            indexed_document_ids={"a", "b", "c"},
            cloud_document_ids={"b", "c"},
            threshold_percentage=40,
        )

        self.assertIsNone(impact)

    def test_modified_document_is_not_a_cloud_deletion(self):
        impact = assess_cloud_deletions(
            source="drive",
            indexed_document_ids={"same-id"},
            cloud_document_ids={"same-id"},
            threshold_percentage=1,
        )

        self.assertIsNone(impact)

    def test_initial_index_with_no_manifest_documents_is_allowed(self):
        impact = assess_cloud_deletions(
            source="drive",
            indexed_document_ids=set(),
            cloud_document_ids=set(),
            threshold_percentage=40,
        )

        self.assertIsNone(impact)

    def test_enforcer_raises_specific_exception_with_impact(self):
        with self.assertRaises(DeletionThresholdExceeded) as raised:
            enforce_deletion_guard(
                source="drive",
                indexed_document_ids={"a", "b"},
                cloud_document_ids={"b"},
                threshold_percentage=50,
            )

        self.assertEqual(raised.exception.impact.deleted_documents, 1)
        self.assertEqual(raised.exception.impact.percentage, 50)

    def test_multisource_guard_reports_the_blocked_source(self):
        source_snapshots = [
            ("drive", {"d1", "d2"}, {"d1", "d2"}),
            ("second-source", {"x1", "x2"}, {"x2"}),
        ]

        with self.assertRaises(DeletionThresholdExceeded) as raised:
            enforce_sources_deletion_guard(
                source_snapshots,
                threshold_percentage=50,
            )

        self.assertEqual(raised.exception.impact.source, "second-source")


if __name__ == "__main__":
    unittest.main()
