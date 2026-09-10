"""State of one Qdrant indexing run, reported while the job advances."""

from collections.abc import Iterable
from dataclasses import dataclass

STATUS_IDLE = "idle"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
STATUS_BLOCKED = "blocked"
STATUS_INTERRUPTED = "interrupted"

PHASE_LISTING_SOURCES = "listing_sources"
PHASE_PREFLIGHT = "preflight"
PHASE_PERMISSIONS = "permissions"
PHASE_DELETING = "deleting"
PHASE_INDEXING = "indexing"
PHASE_LONG_CONTEXT = "long_context"
PHASE_TOPICS = "topics"

DETAIL_MAX_LENGTH = 500


def estimate_eta_seconds(
    files_processed: int,
    files_total: int,
    elapsed_seconds: float,
) -> float | None:
    """Remaining seconds extrapolated from the files already persisted.

    Returns ``None`` until a first file gives a rate to extrapolate from.
    """
    if files_processed <= 0:
        return None

    remaining = max(files_total - files_processed, 0)
    return remaining * (elapsed_seconds / files_processed)


@dataclass
class IndexingRunState:
    status: str = STATUS_IDLE
    phase: str | None = None
    current_source: str | None = None
    sources_total: int = 0
    sources_completed: int = 0
    files_total: int = 0
    files_processed: int = 0
    chunks_indexed: int = 0
    eta_seconds: float | None = None
    detail: str | None = None


class IndexingProgress:
    """Keeps the state of a run in memory and publishes it on every change.

    This base class publishes nothing, so the indexing job can run untracked.
    Subclasses persist `state` by overriding `publish()`.
    """

    def __init__(self) -> None:
        self.state = IndexingRunState()

    def publish(self, *, started: bool = False, finished: bool = False) -> None:
        """Hook for subclasses; the in-memory tracker keeps the state only."""

    def start(self, source_names: Iterable[str]) -> None:
        """Begin a run over the given sources, grouped by name as the job does."""
        self.state = IndexingRunState(
            status=STATUS_RUNNING,
            phase=PHASE_LISTING_SOURCES,
            sources_total=len(set(source_names)),
        )
        self.publish(started=True)

    def set_phase(
        self,
        phase: str,
        *,
        source: str | None = None,
        files_total: int = 0,
    ) -> None:
        """Move to a new phase, resetting the counters it does not report."""
        self.state.phase = phase
        self.state.current_source = source
        self.state.files_total = files_total
        self.state.files_processed = 0
        self.state.eta_seconds = None
        self.publish()

    def report_files(
        self,
        *,
        files_processed: int,
        files_total: int,
        chunks: int,
        elapsed_seconds: float,
    ) -> None:
        self.state.files_processed = files_processed
        self.state.files_total = files_total
        self.state.chunks_indexed += chunks
        self.state.eta_seconds = estimate_eta_seconds(
            files_processed,
            files_total,
            elapsed_seconds,
        )
        self.publish()

    def complete_source(self) -> None:
        self.state.sources_completed += 1
        self.state.current_source = None
        self.state.files_total = 0
        self.state.files_processed = 0
        self.state.eta_seconds = None
        self.publish()

    def finish(self, status: str, *, detail: str | None = None) -> None:
        # A run that fails before `start()` still happened: stamping its start
        # keeps the reported times from belonging to the previous run.
        never_started = self.state.status != STATUS_RUNNING

        self.state.status = status
        self.state.phase = None
        self.state.current_source = None
        self.state.eta_seconds = None
        self.state.detail = detail[:DETAIL_MAX_LENGTH] if detail else None
        self.publish(started=never_started, finished=True)
