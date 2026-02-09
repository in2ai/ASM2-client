import time

import numpy as np
from googleapiclient.errors import HttpError


def safe_execute(request, retries=6, backoff=1.7):
    for i in range(retries):
        try:
            return request.execute()
        except HttpError as e:
            if getattr(e, "resp", None) and e.resp.status in (500, 502, 503, 504):
                time.sleep(backoff**i)
                continue
            raise
    raise RuntimeError("Google API: demasiados fallos consecutivos (5xx).")


def periodic_task(fn, interval_seconds: int):
    """Run fn() every interval_seconds in a blocking loop."""
    while True:
        try:
            fn()
        except Exception as e:
            print(f"[periodic_task] Error: {e}")
        time.sleep(interval_seconds)
