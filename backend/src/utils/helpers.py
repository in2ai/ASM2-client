from contextlib import contextmanager
import logging
import socket
import ssl
import time

from google.auth.exceptions import TransportError
from googleapiclient.errors import HttpError
from httplib2 import ServerNotFoundError


RETRYABLE_HTTP_STATUSES = (500, 502, 503, 504)
RETRYABLE_TRANSPORT_ERRORS = (
    BrokenPipeError,
    ConnectionAbortedError,
    ConnectionResetError,
    ServerNotFoundError,
    TimeoutError,
    TransportError,
    socket.timeout,
    ssl.SSLError,
)


def should_retry(attempt: int, retries: int) -> bool:
    return attempt < retries - 1


def sleep_before_retry(attempt: int, backoff: float):
    time.sleep(backoff ** attempt)


def is_retryable_http_error(error: HttpError) -> bool:
    return bool(
        getattr(error, "resp", None)
        and error.resp.status in RETRYABLE_HTTP_STATUSES
    )


def retry_http_error(error: HttpError, attempt: int, retries: int, backoff: float) -> bool:
    if not is_retryable_http_error(error):
        raise error

    if not should_retry(attempt, retries):
        return False

    sleep_before_retry(attempt, backoff)
    return True


def retry_transport_error(
    error: Exception,
    attempt: int,
    retries: int,
    backoff: float,
) -> bool:
    retrying = should_retry(attempt, retries)
    logging.warning(
        "Google API transport error while executing request (%s). %s attempt %s/%s.",
        type(error).__name__,
        "Retrying" if retrying else "No retries left after",
        attempt + 1,
        retries,
    )

    if not retrying:
        return False

    sleep_before_retry(attempt, backoff)
    return True


def safe_execute(request, retries=6, backoff=1.7, google_retries=1):
    last_http_error = None

    for attempt in range(retries):
        try:
            return request.execute(num_retries=google_retries)

        except HttpError as e:
            last_http_error = e

            if retry_http_error(e, attempt, retries, backoff):
                continue

            break

        except RETRYABLE_TRANSPORT_ERRORS as e:
            if retry_transport_error(e, attempt, retries, backoff):
                continue

            raise

    raise RuntimeError("Google API: demasiados fallos consecutivos (5xx).") from last_http_error


@contextmanager
def process_lock(lock_path: str):
    import fasteners

    lock = fasteners.InterProcessLock(lock_path)
    got = lock.acquire(blocking=False)

    if not got:
        yield False
        return

    try:
        yield True

    finally:
        try:
            lock.release()

        except Exception:
            pass


def periodic_task(job_func, interval: int):
    import time
    import hashlib

    # Generate a deterministic lock file across workers
    ident = f"{job_func.__module__}.{job_func.__qualname__}"
    digest = hashlib.sha256(ident.encode()).hexdigest()[:16]
    lock_path = f"/tmp/periodic-{digest}.lock"

    # Execution loop (use asyncio)
    while True:
        with process_lock(lock_path) as locked:
            if locked:
                job_func()

            time.sleep(interval)
