import unittest
from unittest.mock import patch

import grpc

from src.connectors.qdrant_ops import run_qdrant_write_with_retry


class FakeRpcError(grpc.RpcError):
    def __init__(self, status):
        self._status = status

    def code(self):
        return self._status


class QdrantWriteRetryTests(unittest.TestCase):
    @patch("src.connectors.qdrant_ops.time.sleep")
    def test_retries_transient_failure_then_returns_result(self, sleep):
        attempts = []

        def operation():
            attempts.append(None)
            if len(attempts) < 3:
                raise FakeRpcError(grpc.StatusCode.DEADLINE_EXCEEDED)
            return "ok"

        result = run_qdrant_write_with_retry(
            operation,
            operation_name="test write",
            max_attempts=3,
            initial_delay_seconds=1,
            max_delay_seconds=8,
        )

        self.assertEqual(result, "ok")
        self.assertEqual(len(attempts), 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    @patch("src.connectors.qdrant_ops.time.sleep")
    def test_does_not_retry_non_transient_grpc_failure(self, sleep):
        attempts = []

        def operation():
            attempts.append(None)
            raise FakeRpcError(grpc.StatusCode.INVALID_ARGUMENT)

        with self.assertRaises(FakeRpcError):
            run_qdrant_write_with_retry(
                operation,
                operation_name="test write",
                max_attempts=3,
            )

        self.assertEqual(len(attempts), 1)
        sleep.assert_not_called()

    @patch("src.connectors.qdrant_ops.time.sleep")
    def test_raises_after_transient_attempts_are_exhausted(self, sleep):
        attempts = []

        def operation():
            attempts.append(None)
            raise FakeRpcError(grpc.StatusCode.UNAVAILABLE)

        with self.assertRaises(FakeRpcError):
            run_qdrant_write_with_retry(
                operation,
                operation_name="test write",
                max_attempts=3,
                initial_delay_seconds=0,
                max_delay_seconds=0,
            )

        self.assertEqual(len(attempts), 3)
        self.assertEqual(sleep.call_count, 2)


if __name__ == "__main__":
    unittest.main()
