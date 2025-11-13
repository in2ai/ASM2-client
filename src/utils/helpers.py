import time

from googleapiclient.errors import HttpError
import numpy as np

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

def cosine_dist(a, b):
    a = np.array(a); b = np.array(b)
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-12
    return float(np.dot(a, b) / denom)