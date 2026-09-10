import os
import tempfile
import unittest
from unittest import mock

from fastapi.testclient import TestClient

import server
from src.config.logto_auth import AuthInfo
from src.indexing.progress import STATUS_COMPLETED, STATUS_RUNNING

VDB_ROUTES = ("/start-vdb-update", "/vdb-update-status")

ADMIN = AuthInfo(sub="admin-1", role="admin", roles=["admin"], audience=[])


class FakeTask:
    """Stands in for the asyncio task holding a manually started run."""

    def __init__(self, done: bool):
        self._done = done

    def done(self) -> bool:
        return self._done


def override_admin_auth() -> None:
    """Point the VDB routes' auth dependency at a fixed admin identity."""

    for route in server.app.routes:
        if getattr(route, "path", "") in VDB_ROUTES:
            dependency = route.dependant.dependencies[0].call
            server.app.dependency_overrides[dependency] = lambda: ADMIN


class RunInProgressTests(unittest.TestCase):
    def setUp(self):
        server.app.state.pg_pool = object()
        server.app.state.vdb_update_task = None

    def tearDown(self):
        server.app.state.vdb_update_task = None

    def test_the_task_this_process_started_counts_as_a_run(self):
        server.app.state.vdb_update_task = FakeTask(done=False)

        with mock.patch.object(server, "get_indexing_progress") as progress:
            self.assertTrue(server.is_vdb_run_in_progress())

        # The task alone answers, so a progress read is not even needed.
        progress.assert_not_called()

    def test_a_run_this_process_did_not_start_counts_too(self):
        server.app.state.vdb_update_task = FakeTask(done=True)

        with mock.patch.object(
            server,
            "get_indexing_progress",
            return_value={"status": STATUS_RUNNING},
        ):
            self.assertTrue(server.is_vdb_run_in_progress())

    def test_no_run_once_the_task_and_the_stored_run_are_over(self):
        server.app.state.vdb_update_task = FakeTask(done=True)

        with mock.patch.object(
            server,
            "get_indexing_progress",
            return_value={"status": STATUS_COMPLETED},
        ):
            self.assertFalse(server.is_vdb_run_in_progress())

    def test_an_unreadable_progress_row_does_not_block_the_request(self):
        with mock.patch.object(
            server,
            "get_indexing_progress",
            side_effect=RuntimeError("no progress row"),
        ):
            self.assertFalse(server.is_vdb_run_in_progress())


class VdbUpdateEndpointTests(unittest.TestCase):
    def setUp(self):
        self.lock_path = os.path.join(tempfile.mkdtemp(), "vdb.lock")
        self.scheduled_jobs = []

        for patcher in (
            mock.patch.object(server, "VDB_LOCK", self.lock_path),
            mock.patch.object(
                server,
                "periodic_task",
                lambda job_func, *args, **kwargs: self.scheduled_jobs.append(job_func),
            ),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

        server.app.state.vdb_update_task = None
        override_admin_auth()
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()
        server.app.state.vdb_update_task = None

    def test_starting_schedules_a_run_and_says_so(self):
        with mock.patch.object(server, "is_vdb_run_in_progress", return_value=False):
            response = self.client.post("/start-vdb-update")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"active": True, "scheduled": True})
        self.assertTrue(os.path.isfile(self.lock_path))
        self.assertIsNotNone(server.app.state.vdb_update_task)

    def test_a_reindex_during_a_run_is_reported_as_not_scheduled(self):
        in_flight = FakeTask(done=False)
        server.app.state.vdb_update_task = in_flight

        with mock.patch.object(server, "is_vdb_run_in_progress", return_value=True):
            response = self.client.post("/start-vdb-update")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"active": True, "scheduled": False})
        # Indexing stays enabled, but the run in flight is left alone.
        self.assertTrue(os.path.isfile(self.lock_path))
        self.assertIs(server.app.state.vdb_update_task, in_flight)

    def test_the_status_reports_the_run_apart_from_the_lock(self):
        with open(self.lock_path, "w+"):
            pass

        with mock.patch.object(server, "is_vdb_run_in_progress", return_value=True):
            response = self.client.get("/vdb-update-status")

        self.assertEqual(response.json(), {"active": True, "running": True})

    def test_indexing_can_be_enabled_with_no_run_working(self):
        with open(self.lock_path, "w+"):
            pass

        with mock.patch.object(server, "is_vdb_run_in_progress", return_value=False):
            response = self.client.get("/vdb-update-status")

        self.assertEqual(response.json(), {"active": True, "running": False})


if __name__ == "__main__":
    unittest.main()
