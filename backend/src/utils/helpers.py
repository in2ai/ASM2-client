from contextlib import contextmanager
import time

from googleapiclient.errors import HttpError


def safe_execute(request, retries=6, backoff=1.7):
    for i in range(retries):
        try:
            return request.execute()
        except HttpError as e:
            if getattr(e, "resp", None) and e.resp.status in (500, 502, 503, 504):
                time.sleep(backoff ** i)
                continue
            raise
    raise RuntimeError("Google API: demasiados fallos consecutivos (5xx).")


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
