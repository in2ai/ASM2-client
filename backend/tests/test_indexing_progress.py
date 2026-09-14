import unittest

from src.indexing.progress import (
    PHASE_INDEXING,
    PHASE_LISTING_SOURCES,
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    IndexingProgress,
    estimate_eta_seconds,
)


class RecordingProgress(IndexingProgress):
    """Keeps every published snapshot so the tests can inspect the sequence."""

    def __init__(self):
        super().__init__()
        self.published = []

    def publish(self, *, started: bool = False, finished: bool = False) -> None:
        self.published.append(
            {
                "started": started,
                "finished": finished,
                "status": self.state.status,
                "phase": self.state.phase,
                "current_source": self.state.current_source,
                "files_processed": self.state.files_processed,
                "files_total": self.state.files_total,
                "chunks_indexed": self.state.chunks_indexed,
                "eta_seconds": self.state.eta_seconds,
            }
        )


class EtaEstimationTests(unittest.TestCase):
    def test_no_estimate_before_the_first_file(self):
        self.assertIsNone(estimate_eta_seconds(0, 10, 30))

    def test_extrapolates_from_the_files_already_persisted(self):
        self.assertEqual(estimate_eta_seconds(2, 10, 20), 80)

    def test_finished_work_has_no_remaining_time(self):
        self.assertEqual(estimate_eta_seconds(10, 10, 50), 0)

    def test_extra_processed_files_do_not_produce_negative_time(self):
        self.assertEqual(estimate_eta_seconds(12, 10, 50), 0)


class IndexingProgressTests(unittest.TestCase):
    def test_start_groups_sources_by_name(self):
        progress = RecordingProgress()

        progress.start(["drive", "drive", "dropbox"])

        self.assertEqual(progress.state.status, STATUS_RUNNING)
        self.assertEqual(progress.state.phase, PHASE_LISTING_SOURCES)
        self.assertEqual(progress.state.sources_total, 2)
        self.assertTrue(progress.published[-1]["started"])

    def test_start_clears_the_state_of_the_previous_run(self):
        progress = RecordingProgress()
        progress.start(["drive"])
        progress.report_files(
            files_processed=1,
            files_total=1,
            chunks=7,
            elapsed_seconds=1,
        )
        progress.finish(STATUS_COMPLETED)

        progress.start(["drive"])

        self.assertEqual(progress.state.chunks_indexed, 0)
        self.assertEqual(progress.state.sources_completed, 0)
        self.assertIsNone(progress.state.detail)

    def test_phase_change_resets_the_counters_it_does_not_report(self):
        progress = RecordingProgress()
        progress.start(["drive"])
        progress.set_phase(PHASE_INDEXING, source="drive", files_total=4)
        progress.report_files(
            files_processed=2,
            files_total=4,
            chunks=10,
            elapsed_seconds=10,
        )

        progress.set_phase(PHASE_LISTING_SOURCES, source="dropbox")

        self.assertEqual(progress.state.files_total, 0)
        self.assertEqual(progress.state.files_processed, 0)
        self.assertIsNone(progress.state.eta_seconds)
        # Chunks are a run total, so they survive the phase change.
        self.assertEqual(progress.state.chunks_indexed, 10)

    def test_chunks_accumulate_across_batches_and_sources(self):
        progress = RecordingProgress()
        progress.start(["drive", "dropbox"])
        progress.set_phase(PHASE_INDEXING, source="drive", files_total=2)
        progress.report_files(
            files_processed=1,
            files_total=2,
            chunks=5,
            elapsed_seconds=5,
        )
        progress.report_files(
            files_processed=2,
            files_total=2,
            chunks=3,
            elapsed_seconds=10,
        )
        progress.complete_source()
        progress.set_phase(PHASE_INDEXING, source="dropbox", files_total=1)
        progress.report_files(
            files_processed=1,
            files_total=1,
            chunks=4,
            elapsed_seconds=2,
        )
        progress.complete_source()

        self.assertEqual(progress.state.chunks_indexed, 12)
        self.assertEqual(progress.state.sources_completed, 2)
        self.assertIsNone(progress.state.current_source)

    def test_report_files_publishes_the_remaining_time(self):
        progress = RecordingProgress()
        progress.start(["drive"])
        progress.set_phase(PHASE_INDEXING, source="drive", files_total=10)

        progress.report_files(
            files_processed=2,
            files_total=10,
            chunks=6,
            elapsed_seconds=20,
        )

        self.assertEqual(progress.published[-1]["eta_seconds"], 80)

    def test_finish_marks_the_run_as_finished_with_a_trimmed_detail(self):
        progress = RecordingProgress()
        progress.start(["drive"])

        progress.finish(STATUS_FAILED, detail="x" * 900)

        self.assertEqual(progress.state.status, STATUS_FAILED)
        self.assertIsNone(progress.state.phase)
        self.assertEqual(len(progress.state.detail), 500)
        self.assertTrue(progress.published[-1]["finished"])

    def test_finishing_a_run_that_never_started_stamps_its_start(self):
        progress = RecordingProgress()

        progress.finish(STATUS_FAILED, detail="no sources available")

        self.assertTrue(progress.published[-1]["started"])
        self.assertTrue(progress.published[-1]["finished"])

    def test_finishing_a_started_run_keeps_its_original_start(self):
        progress = RecordingProgress()
        progress.start(["drive"])

        progress.finish(STATUS_COMPLETED)

        self.assertFalse(progress.published[-1]["started"])
        self.assertTrue(progress.published[-1]["finished"])

    def test_untracked_runs_publish_nothing(self):
        progress = IndexingProgress()

        progress.start(["drive"])
        progress.finish(STATUS_COMPLETED)

        self.assertEqual(progress.state.status, STATUS_COMPLETED)


if __name__ == "__main__":
    unittest.main()
