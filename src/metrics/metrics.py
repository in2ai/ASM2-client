import time
from enum import Enum

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
    
    RELEVANT_DOC_RATE='RELEVANT_DOC_RATE'       # % of relevant documents retrieved

    NUM_DOCS_RAG='NUM_DOCS_RAG'                 # Number of docs returned by the RAG
    NUM_DOCS_LLM='NUM_DOCS_LLM'                 # Number of relevant documents after filtering

    NUM_LLM_TOKENS_IN='NUM_LLM_TOKENS_IN'       # Number of LLM input tokens
    NUM_LLM_TOKENS_OUT='NUM_LLM_TOKENS_OUT'     # Number of LLM output tokens
    NUM_RAG_TOKENS_IN='NUM_RAG_TOKENS_IN'       # Number of RAG input tokens
    NUM_RAG_TOKENS_OUT='NUM_RAG_TOKENS_OUT'     # Number of RAG output tokens

# ---------------------------------
# Metric storage
# ---------------------------------

def insert_metric(tag: str, value: float):
    query = """
    INSERT INTO metrics (ts, user_id, user_role, tag, value)
    VALUES (NOW(), %s, %s, %s, %s)
    """

    execute_query(query, (USER_ID, USER_ROLE, tag, value))


def register_words(words: set[str]):
    if not words:
        return

    # Generate query with all value insertions
    value_insertions = ", ".join(["(NOW(), %s, %s, %s)"] * len(words))

    query = f"""
        INSERT INTO word_counts (ts, user_id, user_role, word)
        VALUES {value_insertions}
    """

    # Flatten parameters (3 for each word)
    params = []
    
    for w in words:
        params.extend([USER_ID, USER_ROLE, w])

    execute_query(query, tuple(params))


def register_topic(topic: str):
    query = """
    INSERT INTO topic_counts (ts, user_id, user_role, word)
    VALUES (NOW(), %s, %s, %s)
    """

    execute_query(query, (USER_ID, USER_ROLE, topic))


def register_user_activity():
    query = """
    INSERT INTO user_activity (ts, user_id, user_role)
    VALUES (NOW(), %s, %s)
    """

    execute_query(query, (USER_ID, USER_ROLE))


def log_request(endpoint: str, method: str, status: int, latency: float):
    query = """
    INSERT INTO requests (ts, user_id, user_role, endpoint, method, status, latency)
    VALUES (NOW(), %s, %s, %s, %s, %s, %s)
    """

    execute_query(query, (USER_ID, USER_ROLE, endpoint, method, status, latency))

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
    def __init__(self, metric):
        self.metric = metric

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exception_type, exception_value, exception_traceback):
        # Only insert the metric if no exception occurred
        if exception_type is None:
            elapsed = time.perf_counter() - self.start
            insert_metric(self.metric, elapsed)

        return False
