import time
from enum import Enum

from psycopg2.pool import ThreadedConnectionPool

from src.metrics.connection import execute_query
from src.metrics.context import MetricsActor


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

def insert_metric(
    pool: ThreadedConnectionPool,
    tag: str,
    value: float,
    *,
    actor: MetricsActor,
):
    query = """
    INSERT INTO metrics (ts, user_id, user_role, tag, value)
    VALUES (NOW(), %s, %s, %s, %s)
    """

    execute_query(pool, query, (actor.user_id, actor.user_role, tag, value))


def insert_system_metric(pool: ThreadedConnectionPool, tag: str, value: float):
    """Record server-wide metrics (CPU, RAM, GPU) without user attribution."""
    query = """
    INSERT INTO metrics (ts, tag, value)
    VALUES (NOW(), %s, %s)
    """

    execute_query(pool, query, (tag, value))


def register_words(
    pool: ThreadedConnectionPool,
    words: set[str],
    *,
    actor: MetricsActor,
    lang: str = 'es',
):
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
        params.extend([lang, actor.user_id, actor.user_role, w])

    execute_query(pool, query, tuple(params))


def register_topics(
    pool: ThreadedConnectionPool,
    topics: dict[str, str],
    *,
    actor: MetricsActor,
):
    if not topics:
        return

    value_insertions = ", ".join(["(NOW(), %s, %s, %s, %s)"] * len(topics))

    query = f"""
        INSERT INTO topic_counts (ts, user_id, user_role, word, topic_id)
        VALUES {value_insertions}
    """

    params = []

    for topic_id, name in topics.items():
        params.extend([actor.user_id, actor.user_role, name, topic_id])

    execute_query(pool, query, tuple(params))


def register_topic_intl(pool: ThreadedConnectionPool, mapping: dict):
    rows = []

    for lang, topics in mapping.items():

        if not isinstance(topics, dict):
            continue

        for topic_id, name in topics.items():
            rows.append((topic_id, name, lang))

    if not rows:
        return

    value_insertions = ", ".join(["(NOW(), %s, %s, %s)"] * len(rows))

    query = f"""
        INSERT INTO topic_intl (ts, topic_id, word, lang)
        VALUES {value_insertions}
    """

    params = []

    for topic_id, name, lang in rows:
        params.extend([topic_id, name, lang])

    execute_query(pool, query, tuple(params))


def register_user_activity(pool: ThreadedConnectionPool, *, actor: MetricsActor):
    query = """
    INSERT INTO user_activity (ts, user_id, user_role)
    VALUES (NOW(), %s, %s)
    """

    execute_query(pool, query, (actor.user_id, actor.user_role))


def log_request(
    pool: ThreadedConnectionPool,
    endpoint: str,
    method: str,
    status: int,
    latency: float,
    *,
    actor: MetricsActor,
):
    query = """
    INSERT INTO requests (ts, user_id, user_role, endpoint, method, status, latency)
    VALUES (NOW(), %s, %s, %s, %s, %s, %s)
    """

    execute_query(
        pool,
        query,
        (actor.user_id, actor.user_role, endpoint, method, status, latency),
    )

# ---------------------------------
# Helpers
# ---------------------------------

class TimedMetric:
    """
    Context manager for measuring the execution time of a code block and sending it to the metrics service.

    Example usage:

        ```python
        with TimedMetric(pool, Metrics.REQ_RESPONSE_TIME.value, actor=actor):
            response = make_request()
        ```

    Notes:
        - The metric is only recorded if the block exits without exceptions.
        - Timing is measured using `time.perf_counter()` in fractional seconds.

    Parameters:
        metric (str): The name of the metric to record. Use the `Metrics` enum.
    """
    def __init__(self, pool: ThreadedConnectionPool, metric, *, actor: MetricsActor):
        self.metric = metric
        self.pool = pool
        self.actor = actor

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exception_type, exception_value, exception_traceback):
        # Only insert the metric if no exception occurred
        if exception_type is None:
            elapsed = time.perf_counter() - self.start
            insert_metric(self.pool, self.metric, elapsed, actor=self.actor)

        return False
