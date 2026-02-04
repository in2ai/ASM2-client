import time
from enum import Enum

from psycopg2.pool import ThreadedConnectionPool

from src.config.auth import USER_ID, USER_ROLE
from src.metrics.connection import execute_query

# ---------------------------------
# Float metric list
# ---------------------------------

class Metrics(Enum):
    CPU_USAGE='CPU_USAGE'                       # Percentage of CPU used
    RAM_USAGE='RAM_USAGE'                       # Percentage of RAM used
    GPU_USAGE='GPU_USAGE'                       # Percentage of GPU used
    
    LLM_RESPONSE_TIME='LLM_RESPONSE_TIME'       # LLM response time
    DOC_RESPONSE_TIME='DOC_RESPONSE_TIME'       # RAG latency
    
    NUM_DOCS_RAG='NUM_DOCS_RAG'                 # Number of docs returned for each query

    NUM_LLM_TOKENS_IN='NUM_LLM_TOKENS_IN'       # Number of LLM input tokens
    NUM_LLM_TOKENS_OUT='NUM_LLM_TOKENS_OUT'     # Number of LLM output tokens
    NUM_RAG_TOKENS_IN='NUM_RAG_TOKENS_IN'       # Number of RAG input tokens
    NUM_RAG_TOKENS_OUT='NUM_RAG_TOKENS_OUT'     # Number of RAG output tokens

# ---------------------------------
# Metric storage
# ---------------------------------

def insert_metric(pool: ThreadedConnectionPool, tag: str, value: float):
    query = """
    INSERT INTO metrics (ts, user_id, user_role, tag, value)
    VALUES (NOW(), %s, %s, %s, %s)
    """

    execute_query(pool, query, (USER_ID, USER_ROLE, tag, value))


def register_words(pool: ThreadedConnectionPool, words: set[str], lang: str = 'es'):
    if not words:
        return

    # Generate query with all value insertions
    value_insertions = ", ".join(["(NOW(), %s, %s, %s, %s)"] * len(words))

    query = f"""
        INSERT INTO word_counts (ts, lang, user_id, user_role, word)
        VALUES {value_insertions}
    """

    # Flatten parameters (3 for each word)
    params = []
    
    for w in words:
        params.extend([lang, USER_ID, USER_ROLE, w])

    execute_query(pool, query, tuple(params))


def register_topics(pool: ThreadedConnectionPool, topics: set[str]):
    if not topics:
        return

    # Generate query with all value insertions
    value_insertions = ", ".join(["(NOW(), %s, %s, %s)"] * len(topics))

    query = f"""
        INSERT INTO topic_counts (ts, user_id, user_role, word)
        VALUES {value_insertions}
    """

    # Flatten parameters (3 for each topic)
    params = []
    
    for t in topics:
        params.extend([USER_ID, USER_ROLE, t])

    execute_query(pool, query, tuple(params))


def register_user_activity(pool: ThreadedConnectionPool):
    query = """
    INSERT INTO user_activity (ts, user_id, user_role)
    VALUES (NOW(), %s, %s)
    """

    execute_query(pool, query, (USER_ID, USER_ROLE))


def log_request(pool: ThreadedConnectionPool, endpoint: str, method: str, status: int, latency: float):
    query = """
    INSERT INTO requests (ts, user_id, user_role, endpoint, method, status, latency)
    VALUES (NOW(), %s, %s, %s, %s, %s, %s)
    """

    execute_query(pool, query, (USER_ID, USER_ROLE, endpoint, method, status, latency))

# ---------------------------------
# Helpers
# ---------------------------------

class TimedMetric:
    """
    Context manager for measuring the execution time of a code block and sending it to the metrics service.

    Example usage:

        ```python
        with TimedMetric(Metrics.REQ_RESPONSE_TIME.value):
            response = make_request()
        ```

    Notes:
        - The metric is only recorded if the block exits without exceptions.
        - Timing is measured using `time.perf_counter()` in fractional seconds.

    Parameters:
        metric (str): The name of the metric to record. Use the `Metrics` enum.
    """
    def __init__(self, pool: ThreadedConnectionPool, metric):
        self.metric = metric
        self.pool = pool

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exception_type, exception_value, exception_traceback):
        # Only insert the metric if no exception occurred
        if exception_type is None:
            elapsed = time.perf_counter() - self.start
            insert_metric(self.pool, self.metric, elapsed)

        return False
