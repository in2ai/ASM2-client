from dataclasses import dataclass
from datetime import date, timedelta

from psycopg2.pool import ThreadedConnectionPool

from src.metrics.connection import execute_query_dict


@dataclass(frozen=True)
class MetricsQueryParams:
    start_date: str | None = None
    end_date: str | None = None
    user_id: str | None = None
    user_role: str | None = None
    lang: str | None = None


def build_query_params(
    start_date: date | None,
    end_date: date | None,
    user_id: str | None,
    user_role: str | None,
    lang: str | None,
) -> MetricsQueryParams:
    normalized_start = start_date.isoformat() if start_date else None
    normalized_end = (end_date + timedelta(days=1)).isoformat() if end_date else None

    return MetricsQueryParams(
        start_date=normalized_start,
        end_date=normalized_end,
        user_id=user_id,
        user_role=user_role,
        lang=lang,
    )


def _parse_count(value) -> int:
    if value is None:
        return 0
    return int(value)


def _build_filter_conditions(
    params: MetricsQueryParams,
    *,
    include_user_id: bool = False,
    include_user_role: bool = False,
    include_lang: bool = False,
) -> tuple[list[str], list[str]]:
    conditions: list[str] = []
    query_params: list[str] = []

    if params.start_date:
        conditions.append("ts >= %s")
        query_params.append(params.start_date)

    if params.end_date:
        conditions.append("ts <= %s")
        query_params.append(params.end_date)

    if include_user_id and params.user_id:
        conditions.append("user_id = %s")
        query_params.append(params.user_id)

    if include_user_role and params.user_role:
        conditions.append("user_role = %s")
        query_params.append(params.user_role)

    if include_lang and params.lang:
        conditions.append("lang = %s")
        query_params.append(params.lang)

    return conditions, query_params


def _append_and_conditions(query: str, conditions: list[str]) -> str:
    if not conditions:
        return query
    return f"{query} AND {' AND '.join(conditions)}"


def mean_metric(
    pool: ThreadedConnectionPool, tag: str, params: MetricsQueryParams
) -> float | None:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )

    query = _append_and_conditions(
        "SELECT AVG(value) as avg FROM metrics WHERE tag = %s",
        conditions,
    )

    rows = execute_query_dict(pool, query, [tag, *query_params])
    if not rows:
        return None

    return rows[0].get("avg")


def count_metrics(
    pool: ThreadedConnectionPool, params: MetricsQueryParams, tag: str | None = None
) -> int:
    query_params: list[str] = []
    query = "SELECT COUNT(*) as cnt FROM metrics WHERE 1=1"

    if tag:
        query += " AND tag = %s"
        query_params.append(tag)

    conditions, filter_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )

    query = _append_and_conditions(query, conditions)
    rows = execute_query_dict(pool, query, [*query_params, *filter_params])

    return _parse_count(rows[0].get("cnt") if rows else None)


def get_metrics_by_tag(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )

    query = f"""
    SELECT
      tag,
      AVG(value) as avg_value,
      COUNT(*) as cnt
    FROM metrics
    {_append_and_conditions("WHERE tag IS NOT NULL", conditions)}
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 20
    """

    rows = execute_query_dict(pool, query, query_params)
    return [
        {
            "tag": row.get("tag"),
            "avg_value": row.get("avg_value") or 0,
            "count": _parse_count(row.get("cnt")),
        }
        for row in rows
    ]


def mean_session_length(
    pool: ThreadedConnectionPool,
    params: MetricsQueryParams,
    session_gap_minutes: int = 10,
) -> float | None:
    gap_micros = session_gap_minutes * 60 * 1000 * 1000
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    time_filter = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
    WITH user_events AS (
        SELECT
            user_id,
            ts,
            LAG(ts) OVER (PARTITION BY user_id ORDER BY ts) AS prev_ts
        FROM user_activity
        {time_filter}
    ),
    sessions AS (
        SELECT
            user_id,
            ts,
            SUM(CASE WHEN prev_ts IS NULL OR (ts - prev_ts) >= {gap_micros} THEN 1 ELSE 0 END)
                OVER (PARTITION BY user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
        FROM user_events
    )
    SELECT
        AVG(session_length) / 1000000.0 AS mean_session_seconds
    FROM (
        SELECT
            user_id,
            session_id,
            MAX(ts) - MIN(ts) AS session_length
        FROM sessions
        GROUP BY user_id, session_id
    ) t
    """

    rows = execute_query_dict(pool, query, query_params)
    if not rows:
        return None

    return rows[0].get("mean_session_seconds")


def get_unique_users(pool: ThreadedConnectionPool, params: MetricsQueryParams) -> int:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = _append_and_conditions(
        "SELECT COUNT(DISTINCT user_id) as cnt FROM user_activity WHERE 1=1",
        conditions,
    )
    rows = execute_query_dict(pool, query, query_params)
    return _parse_count(rows[0].get("cnt") if rows else None)


def get_total_activity_events(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> int:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = _append_and_conditions(
        "SELECT COUNT(*) as cnt FROM user_activity WHERE 1=1",
        conditions,
    )
    rows = execute_query_dict(pool, query, query_params)
    return _parse_count(rows[0].get("cnt") if rows else None)


def get_user_role_distribution(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> dict[str, int]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = _append_and_conditions(
        """
        SELECT user_role, COUNT(DISTINCT user_id) as cnt
        FROM user_activity
        WHERE user_role IS NOT NULL
        """,
        conditions,
    )

    rows = execute_query_dict(
        pool, f"{query} GROUP BY user_role ORDER BY cnt DESC", query_params
    )
    return {str(row.get("user_role")): _parse_count(row.get("cnt")) for row in rows}


def get_activity_by_day(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = f"""
    SELECT
      to_str(ts, 'yyyy-MM-dd') as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity
    {_append_and_conditions("WHERE 1=1", conditions)}
    GROUP BY to_str(ts, 'yyyy-MM-dd')
    ORDER BY date DESC
    LIMIT 30
    """
    rows = execute_query_dict(pool, query, query_params)
    mapped = [
        {
            "date": row.get("date"),
            "event_count": _parse_count(row.get("event_count")),
            "unique_users": _parse_count(row.get("unique_users")),
        }
        for row in rows
    ]
    mapped.reverse()
    return mapped


def get_hourly_activity_pattern(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = f"""
    SELECT
      EXTRACT(HOUR FROM ts) as hour,
      COUNT(*) as event_count
    FROM user_activity
    {_append_and_conditions("WHERE 1=1", conditions)}
    GROUP BY EXTRACT(HOUR FROM ts)
    ORDER BY hour
    """
    rows = execute_query_dict(pool, query, query_params)
    hourly_map = {
        int(row.get("hour")): _parse_count(row.get("event_count")) for row in rows
    }

    return [
        {"hour": hour, "event_count": hourly_map.get(hour, 0)} for hour in range(24)
    ]


def get_response_time_trend(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(params)
    query = f"""
    SELECT
      to_str(ts, 'yyyy-MM-dd') as date,
      AVG(CASE WHEN tag = 'LLM_RESPONSE_TIME' THEN value ELSE NULL END) as llm_response_time,
      AVG(CASE WHEN tag = 'DOC_RESPONSE_TIME' THEN value ELSE NULL END) as doc_response_time
    FROM metrics
    {_append_and_conditions("WHERE tag IN ('LLM_RESPONSE_TIME', 'DOC_RESPONSE_TIME')", conditions)}
    GROUP BY to_str(ts, 'yyyy-MM-dd')
    ORDER BY date DESC
    LIMIT 30
    """
    rows = execute_query_dict(pool, query, query_params)
    mapped = [
        {
            "date": row.get("date"),
            "llm_response_time": row.get("llm_response_time") or 0,
            "doc_response_time": row.get("doc_response_time") or 0,
        }
        for row in rows
    ]
    mapped.reverse()
    return mapped


def get_token_usage_stats(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> dict:
    conditions, query_params = _build_filter_conditions(params)
    query = f"""
    SELECT
      SUM(CASE WHEN tag = 'NUM_LLM_TOKENS_IN' THEN value ELSE 0 END) as llm_tokens_in,
      SUM(CASE WHEN tag = 'NUM_LLM_TOKENS_OUT' THEN value ELSE 0 END) as llm_tokens_out,
      SUM(CASE WHEN tag = 'NUM_RAG_TOKENS_IN' THEN value ELSE 0 END) as rag_tokens_in,
      SUM(CASE WHEN tag = 'NUM_RAG_TOKENS_OUT' THEN value ELSE 0 END) as rag_tokens_out
    FROM metrics
    {_append_and_conditions("WHERE tag IN ('NUM_LLM_TOKENS_IN', 'NUM_LLM_TOKENS_OUT', 'NUM_RAG_TOKENS_IN', 'NUM_RAG_TOKENS_OUT')", conditions)}
    """
    rows = execute_query_dict(pool, query, query_params)
    row = rows[0] if rows else {}
    return {
        "llm_tokens_in": row.get("llm_tokens_in") or 0,
        "llm_tokens_out": row.get("llm_tokens_out") or 0,
        "rag_tokens_in": row.get("rag_tokens_in") or 0,
        "rag_tokens_out": row.get("rag_tokens_out") or 0,
    }


def get_system_health_stats(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> dict:
    conditions, query_params = _build_filter_conditions(params)
    query = f"""
    SELECT
      AVG(CASE WHEN tag = 'CPU_USAGE' THEN value ELSE NULL END) as avg_cpu,
      AVG(CASE WHEN tag = 'RAM_USAGE' THEN value ELSE NULL END) as avg_ram,
      AVG(CASE WHEN tag = 'GPU_USAGE' THEN value ELSE NULL END) as avg_gpu,
      MAX(CASE WHEN tag = 'CPU_USAGE' THEN value ELSE NULL END) as max_cpu,
      MAX(CASE WHEN tag = 'RAM_USAGE' THEN value ELSE NULL END) as max_ram,
      MAX(CASE WHEN tag = 'GPU_USAGE' THEN value ELSE NULL END) as max_gpu
    FROM metrics
    {_append_and_conditions("WHERE tag IN ('CPU_USAGE', 'RAM_USAGE', 'GPU_USAGE')", conditions)}
    """
    rows = execute_query_dict(pool, query, query_params)
    row = rows[0] if rows else {}
    return {
        "avg_cpu": row.get("avg_cpu") or 0,
        "avg_ram": row.get("avg_ram") or 0,
        "avg_gpu": row.get("avg_gpu") or 0,
        "max_cpu": row.get("max_cpu") or 0,
        "max_ram": row.get("max_ram") or 0,
        "max_gpu": row.get("max_gpu") or 0,
    }


def get_avg_docs_per_query(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> float:
    conditions, query_params = _build_filter_conditions(params)
    query = f"""
    SELECT AVG(value) as avg_docs
    FROM metrics
    {_append_and_conditions("WHERE tag = 'NUM_DOCS_RAG'", conditions)}
    """
    rows = execute_query_dict(pool, query, query_params)
    if not rows:
        return 0
    return rows[0].get("avg_docs") or 0


def top_k_search_terms(
    pool: ThreadedConnectionPool, params: MetricsQueryParams, k: int = 10
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
        include_lang=True,
    )
    query = _append_and_conditions(
        "SELECT word, COUNT(*) as cnt FROM word_counts WHERE 1=1",
        conditions,
    )
    query += " GROUP BY word ORDER BY cnt DESC LIMIT %s"
    rows = execute_query_dict(pool, query, [*query_params, k])

    return [
        {"word": row.get("word"), "count": _parse_count(row.get("cnt"))} for row in rows
    ]


def top_k_topics(
    pool: ThreadedConnectionPool, params: MetricsQueryParams, k: int = 10
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = _append_and_conditions(
        "SELECT topic_id, MAX(word) as fallback_word, COUNT(*) as cnt FROM topic_counts WHERE 1=1",
        conditions,
    )
    query += " GROUP BY topic_id ORDER BY cnt DESC LIMIT %s"
    rows = execute_query_dict(pool, query, [*query_params, k])

    topic_ids = []
    for row in rows:
        topic_id = row.get("topic_id")
        if topic_id and topic_id not in topic_ids:
            topic_ids.append(topic_id)

    translated_by_topic_id: dict[str, str] = {}

    if params.lang and topic_ids:
        placeholders = ", ".join(["%s"] * len(topic_ids))
        intl_query = f"""
        SELECT topic_id, MAX(word) as translated_word
        FROM topic_intl
        WHERE lang = %s
          AND topic_id IN ({placeholders})
        GROUP BY topic_id
        """
        intl_rows = execute_query_dict(pool, intl_query, [params.lang, *topic_ids])
        for row in intl_rows:
            topic_id = row.get("topic_id")
            translated_word = row.get("translated_word")
            if topic_id and translated_word:
                translated_by_topic_id[str(topic_id)] = str(translated_word)

    return [
        {
            "topic": translated_by_topic_id.get(str(row.get("topic_id")))
            or row.get("fallback_word"),
            "count": _parse_count(row.get("cnt")),
        }
        for row in rows
    ]
