import time
from enum import Enum

from src.metrics.connection import execute_query

# ---------------------------------
# Float metric list
# ---------------------------------

class Metrics(Enum):
    REQ_RESPONSE_TIME='REQ_RESPONSE_TIME'       # Request latency
    LLM_RESPONSE_TIME='LLM_RESPONSE_TIME'       # LLM response time
    DOC_RESPONSE_TIME='DOC_RESPONSE_TIME'       # RAG latency
    
    RELEVANT_DOC_RATE='RELEVANT_DOC_RATE'       # % of relevant documents retrieved

    NUM_DOCS_RAG='NUM_DOCS_RAG'                 # Number of docs returned by the RAG
    NUM_DOCS_LLM='NUM_DOCS_LLM'                 # Number of relevant documents after filtering
    NUM_TOKENS_IN='NUM_TOKENS_IN'               # Number of LLM input tokens
    NUM_TOKENS_OUT='NUM_TOKENS_OUT'             # Number of LLM output tokens

    ESTIMATED_COST_REQ='ESTIMATED_COST_REQ'     # Estimated cost of the LLM requests

# ---------------------------------
# Metric storage
# ---------------------------------

def insert_metric(tag: str, value: float):
    query = """
    INSERT INTO metrics (ts, tag, value)
    VALUES (NOW(), %s, %s)
    """

    execute_query(query, (tag, value))

def register_word(word: str):
    query = """
    INSERT INTO word_counts (ts, word)
    VALUES (NOW(), %s)
    """

    execute_query(query, (word,))

def register_topic(topic: str):
    query = """
    INSERT INTO topic_counts (ts, topic)
    VALUES (NOW(), %s)
    """

    execute_query(query, (topic,))

def register_user_activity(user_id: str):
    query = """
    INSERT INTO user_activity (ts, user_id)
    VALUES (NOW(), %s)
    """

    execute_query(query, (user_id,))

def log_request(user_id: str, endpoint: str, method: str, status: int, latency: float):
    query = """
    INSERT INTO requests (ts, user_id, endpoint, method, status, latency)
    VALUES (NOW(), %s, %s, %s, %s, %s)
    """

    execute_query(query, (user_id, endpoint, method, status, latency))

# ---------------------------------
# Helpers
# ---------------------------------

class TimedMetric:
    """
    Context manager for measuring the execution time of a code block and sending it to the metrics service.

    Example usage:

        ```python
        with TimedMetric(Metrics.REQ_RESPONSE_TIME):
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

# ---------------------------------
# Metric Queries (TODO)
# ---------------------------------