import unittest

from src.indexing.deletion_guard import (
    DeletionThresholdExceeded,
    SourceDeletionImpact,
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

    def test_multisource_guard_allows_high_percentage_in_small_source(self):
        source_snapshots = [
            ("small", {"s1", "s2"}, {"s2"}),
            ("large", {f"l{i}" for i in range(8)}, {f"l{i}" for i in range(8)}),
        ]

        enforce_sources_deletion_guard(
            source_snapshots,
            threshold_percentage=40,
        )

    def test_multisource_guard_blocks_at_aggregate_threshold(self):
        source_snapshots = [
            ("first", {"a", "b"}, {"b"}),
            (
                "second",
                {f"s{i}" for i in range(8)},
                {f"s{i}" for i in range(3, 8)},
            ),
        ]

        with self.assertRaises(DeletionThresholdExceeded) as raised:
            enforce_sources_deletion_guard(
                source_snapshots,
                threshold_percentage=40,
            )

        impact = raised.exception.impact
        self.assertEqual(impact.deleted_documents, 4)
        self.assertEqual(impact.total_documents, 10)
        self.assertEqual(impact.percentage, 40)

    def test_multisource_guard_reports_only_affected_sources(self):
        source_snapshots = [
            ("intact", {"i1", "i2"}, {"i1", "i2"}),
            ("first", {"a", "b"}, {"b"}),
            (
                "second",
                {f"s{i}" for i in range(8)},
                {f"s{i}" for i in range(3, 8)},
            ),
        ]

        with self.assertRaises(DeletionThresholdExceeded) as raised:
            enforce_sources_deletion_guard(
                source_snapshots,
                threshold_percentage=30,
            )

        self.assertEqual(
            raised.exception.impact.source_breakdown,
            (
                SourceDeletionImpact(
                    source="first", deleted_documents=1, total_documents=2
                ),
                SourceDeletionImpact(
                    source="second", deleted_documents=3, total_documents=8
                ),
            ),
        )


if __name__ == "__main__":
    unittest.main()
