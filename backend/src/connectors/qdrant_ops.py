import logging
import time
from typing import Callable, TypeVar

import grpc

_T = TypeVar("_T")

QDRANT_WRITE_MAX_ATTEMPTS = 3
QDRANT_WRITE_RETRY_INITIAL_SECONDS = 1.0
QDRANT_WRITE_RETRY_MAX_SECONDS = 8.0

RETRYABLE_GRPC_STATUS_CODES = frozenset(
    {
        grpc.StatusCode.ABORTED,
        grpc.StatusCode.DEADLINE_EXCEEDED,
        grpc.StatusCode.RESOURCE_EXHAUSTED,
        grpc.StatusCode.UNAVAILABLE,
    }
)


def run_qdrant_write_with_retry(
    operation: Callable[[], _T],
    *,
    operation_name: str,
    max_attempts: int | None = None,
    initial_delay_seconds: float | None = None,
    max_delay_seconds: float | None = None,
) -> _T:
    """Run an idempotent Qdrant write and retry transient gRPC failures."""
    attempts = max(
        1,
        QDRANT_WRITE_MAX_ATTEMPTS if max_attempts is None else max_attempts,
    )
    initial_delay = max(
        0.0,
        (
            QDRANT_WRITE_RETRY_INITIAL_SECONDS
            if initial_delay_seconds is None
            else initial_delay_seconds
        ),
    )
    max_delay = max(
        initial_delay,
        (
            QDRANT_WRITE_RETRY_MAX_SECONDS
            if max_delay_seconds is None
            else max_delay_seconds
        ),
    )

    for attempt in range(1, attempts + 1):
        try:
            return operation()
        except grpc.RpcError as exc:
            status = exc.code()

            if status not in RETRYABLE_GRPC_STATUS_CODES or attempt == attempts:
                raise

            delay = min(initial_delay * (2 ** (attempt - 1)), max_delay)
            logging.warning(
                "Transient Qdrant failure during %s "
                "(status=%s, attempt=%d/%d); retrying in %.1fs",
                operation_name,
                status.name,
                attempt,
                attempts,
                delay,
            )
            time.sleep(delay)

    raise RuntimeError("Qdrant retry loop exited unexpectedly")
