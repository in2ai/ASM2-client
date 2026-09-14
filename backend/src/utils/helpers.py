from contextlib import contextmanager
import hashlib
import logging
import socket
import ssl
import threading
import time

from google.auth.exceptions import TransportError
from googleapiclient.errors import HttpError
from httplib2 import ServerNotFoundError
from dropbox.exceptions import InternalServerError, RateLimitError

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


def safe_call(fn, *args, **kwargs):
    delay = 1.0
    last_error = None

    for _ in range(5):
        try:
            return fn(*args, **kwargs)

        except RateLimitError as e:
            last_error = e
            wait = getattr(e, "backoff", None) or delay

        except InternalServerError as e:
            last_error = e
            wait = delay

        time.sleep(wait)
        delay = min(delay * 2, 60)

    raise last_error


THREAD_LOCKS: dict[str, threading.Lock] = {}
REGISTRY_GUARD = threading.Lock()


def _thread_lock_for(key: str) -> threading.Lock:
    with REGISTRY_GUARD:
        return THREAD_LOCKS.setdefault(key, threading.Lock())


@contextmanager
def process_lock(lock_path: str):
    import fasteners

    tlock = _thread_lock_for(lock_path)
    if not tlock.acquire(blocking=False):
        yield False
        return

    try:
        plock = fasteners.InterProcessLock(lock_path)
        if not plock.acquire(blocking=False):
            yield False
            return

        try:
            yield True
        finally:
            plock.release()
    finally:
        tlock.release()


def periodic_task(job_func, interval: int, lock_name: str = "", execute_once: bool = False) -> bool:
    if lock_name:
        lock_path = f"/tmp/periodic-{lock_name}.lock"
    else:
        ident = f"{job_func.__module__}.{job_func.__qualname__}"
        lock_path = f"/tmp/periodic-{hashlib.sha256(ident.encode()).hexdigest()[:16]}.lock"

    while True:
        acquired = False
        try:
            with process_lock(lock_path) as locked:   # held only for the run
                if locked:
                    acquired = True
                    job_func()
        except Exception:
            logging.exception("Periodic job %s failed", lock_name or lock_path)

        if execute_once:
            return acquired

        time.sleep(interval)
