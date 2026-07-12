from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class DeletionImpact:
    source: str
    deleted_documents: int
    total_documents: int
    percentage: float
    threshold_percentage: float


class DeletionThresholdExceeded(RuntimeError):
    def __init__(self, impact: DeletionImpact):
        self.impact = impact
        super().__init__(
            "Deletion guard triggered for "
            f"{impact.source}: {impact.deleted_documents}/{impact.total_documents} "
            f"documents ({impact.percentage:.2f}%) meets the "
            f"{impact.threshold_percentage:.2f}% threshold"
        )


def assess_cloud_deletions(
    *,
    source: str,
    indexed_document_ids: Iterable[str],
    cloud_document_ids: Iterable[str],
    threshold_percentage: float,
) -> DeletionImpact | None:
    """Return the blocking impact when cloud deletions meet the threshold.

    IDs which still exist in the cloud are deliberately excluded, even when their
    modification timestamp changed and Qdrant will later replace their chunks.
    """
    indexed_ids = frozenset(indexed_document_ids)
    if not indexed_ids:
        return None

    deleted_documents = len(indexed_ids.difference(cloud_document_ids))
    if deleted_documents == 0:
        return None

    percentage = deleted_documents * 100.0 / len(indexed_ids)
    if percentage < threshold_percentage:
        return None

    return DeletionImpact(
        source=source,
        deleted_documents=deleted_documents,
        total_documents=len(indexed_ids),
        percentage=percentage,
        threshold_percentage=threshold_percentage,
    )


def enforce_deletion_guard(
    *,
    source: str,
    indexed_document_ids: Iterable[str],
    cloud_document_ids: Iterable[str],
    threshold_percentage: float,
) -> None:
    impact = assess_cloud_deletions(
        source=source,
        indexed_document_ids=indexed_document_ids,
        cloud_document_ids=cloud_document_ids,
        threshold_percentage=threshold_percentage,
    )
    if impact is not None:
        raise DeletionThresholdExceeded(impact)


def enforce_sources_deletion_guard(
    source_snapshots: Iterable[
        tuple[str, Iterable[str], Iterable[str]]
    ],
    *,
    threshold_percentage: float,
) -> None:
    """Validate every source snapshot before the caller starts any mutation."""
    for source, indexed_document_ids, cloud_document_ids in source_snapshots:
        enforce_deletion_guard(
            source=source,
            indexed_document_ids=indexed_document_ids,
            cloud_document_ids=cloud_document_ids,
            threshold_percentage=threshold_percentage,
        )
