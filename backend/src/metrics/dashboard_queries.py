from dataclasses import dataclass
from datetime import date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from psycopg2.pool import ThreadedConnectionPool

from src.metrics.connection import execute_query_dict

# Server-wide samples. They carry no user attribution, so they are never part
# of the per-user metric counts the dashboard reports.
SYSTEM_METRIC_TAGS = ("CPU_USAGE", "RAM_USAGE", "GPU_USAGE")

# End-to-end latency of one chat turn. `LLM_RESPONSE_TIME` is the name this
# measurement was written under before it was clear it timed the whole turn
# (retrieval included) rather than the model alone; it is still read so the
# history stays on the chart.
TURN_LATENCY_TAGS = ("TURN_RESPONSE_TIME", "LLM_RESPONSE_TIME")

# A day-bucketed chart never returns more rows than this, however wide the
# selected range is. A year of daily points is already past what is readable.
MAX_DAY_BUCKETS = 366


@dataclass(frozen=True)
class MetricsQueryParams:
    start_date: str | None = None
    end_date: str | None = None
    user_id: str | None = None
    user_role: str | None = None
    lang: str | None = None
    # IANA name. Day and hour buckets are cut on this clock, not the server's.
    timezone: str = "UTC"


def normalize_timezone(timezone: str | None) -> str:
    """Fall back to UTC rather than let an unknown zone fail every query."""
    if not timezone:
        return "UTC"

    try:
        ZoneInfo(timezone)

    except (ZoneInfoNotFoundError, ValueError):
        return "UTC"

    return timezone


def build_query_params(
    start_date: date | None,
    end_date: date | None,
    user_id: str | None,
    user_role: str | None,
    lang: str | None,
    timezone: str | None = None,
) -> MetricsQueryParams:
    normalized_start = start_date.isoformat() if start_date else None
    # Stored as the exclusive upper bound, so the filter can stay a plain `<`.
    normalized_end = (end_date + timedelta(days=1)).isoformat() if end_date else None

    return MetricsQueryParams(
        start_date=normalized_start,
        end_date=normalized_end,
        user_id=user_id,
        user_role=user_role,
        lang=lang,
        timezone=normalize_timezone(timezone),
    )


def _parse_count(value) -> int:
    if value is None:
        return 0
    return int(value)


def _parse_optional_float(value) -> float | None:
    """Keep "no samples" distinct from "measured zero"."""
    if value is None:
        return None
    return float(value)


def _day_bucket_limit(params: MetricsQueryParams) -> int:
    """How many daily rows the selected range can hold."""
    if not (params.start_date and params.end_date):
        return MAX_DAY_BUCKETS

    start = date.fromisoformat(params.start_date)
    end = date.fromisoformat(params.end_date)

    return max(1, min((end - start).days, MAX_DAY_BUCKETS))


def _build_filter_conditions(
    params: MetricsQueryParams,
    *,
    include_user_id: bool = False,
    include_user_role: bool = False,
    include_lang: bool = False,
) -> tuple[list[str], list[str]]:
    conditions: list[str] = []
    query_params: list[str] = []

    # The dates arrive as calendar days on the viewer's clock, so they are read
    # back in that zone instead of the database's.
    if params.start_date:
        conditions.append("ts >= (%s::timestamp AT TIME ZONE %s)")
        query_params.extend([params.start_date, params.timezone])

    if params.end_date:
        conditions.append("ts < (%s::timestamp AT TIME ZONE %s)")
        query_params.extend([params.end_date, params.timezone])

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


def mean_turn_latency(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> float | None:
    """Mean seconds for a whole chat turn, across the old and new tag names."""
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    placeholders = ", ".join(["%s"] * len(TURN_LATENCY_TAGS))

    query = _append_and_conditions(
        f"SELECT AVG(value) as avg FROM metrics WHERE tag IN ({placeholders})",
        conditions,
    )

    rows = execute_query_dict(pool, query, [*TURN_LATENCY_TAGS, *query_params])
    if not rows:
        return None

    return rows[0].get("avg")


def count_metrics(
    pool: ThreadedConnectionPool,
    params: MetricsQueryParams,
    tag: str | None = None,
    *,
    exclude_system_tags: bool = False,
) -> int:
    query_params: list[str] = []
    query = "SELECT COUNT(*) as cnt FROM metrics WHERE 1=1"

    if tag:
        query += " AND tag = %s"
        query_params.append(tag)

    if exclude_system_tags:
        placeholders = ", ".join(["%s"] * len(SYSTEM_METRIC_TAGS))
        query += f" AND tag NOT IN ({placeholders})"
        query_params.extend(SYSTEM_METRIC_TAGS)

    conditions, filter_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )

    query = _append_and_conditions(query, conditions)
    rows = execute_query_dict(pool, query, [*query_params, *filter_params])

    return _parse_count(rows[0].get("cnt") if rows else None)


def mean_session_length(
    pool: ThreadedConnectionPool,
    params: MetricsQueryParams,
    session_gap_minutes: int = 10,
) -> float | None:
    gap_seconds = session_gap_minutes * 60
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
            SUM(CASE WHEN prev_ts IS NULL OR EXTRACT(EPOCH FROM (ts - prev_ts)) >= {gap_seconds} THEN 1 ELSE 0 END)
                OVER (PARTITION BY user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
        FROM user_events
    )
    SELECT
        AVG(EXTRACT(EPOCH FROM session_length)) AS mean_session_seconds
    FROM (
        SELECT
            user_id,
            session_id,
            MAX(ts) - MIN(ts) AS session_length
        FROM sessions
        GROUP BY user_id, session_id
        -- A lone event spans no time. Counting it as a zero-second session
        -- drags the mean toward zero instead of describing real sessions.
        HAVING COUNT(*) > 1
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
      to_char(ts AT TIME ZONE %s, 'YYYY-MM-DD') as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity
    {_append_and_conditions("WHERE 1=1", conditions)}
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT {_day_bucket_limit(params)}
    """
    rows = execute_query_dict(pool, query, [params.timezone, *query_params])
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
      EXTRACT(HOUR FROM ts AT TIME ZONE %s) as hour,
      COUNT(*) as event_count
    FROM user_activity
    {_append_and_conditions("WHERE 1=1", conditions)}
    GROUP BY 1
    ORDER BY 1
    """
    rows = execute_query_dict(pool, query, [params.timezone, *query_params])
    hourly_map = {
        int(row.get("hour")): _parse_count(row.get("event_count")) for row in rows
    }

    return [
        {"hour": hour, "event_count": hourly_map.get(hour, 0)} for hour in range(24)
    ]


def get_response_time_trend(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> list[dict]:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    turn_tags = ", ".join(f"'{tag}'" for tag in TURN_LATENCY_TAGS)
    query = f"""
    SELECT
      to_char(ts AT TIME ZONE %s, 'YYYY-MM-DD') as date,
      AVG(CASE WHEN tag IN ({turn_tags}) THEN value ELSE NULL END) as turn_response_time,
      AVG(CASE WHEN tag = 'DOC_RESPONSE_TIME' THEN value ELSE NULL END) as doc_response_time
    FROM metrics
    {_append_and_conditions(f"WHERE tag IN ({turn_tags}, 'DOC_RESPONSE_TIME')", conditions)}
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT {_day_bucket_limit(params)}
    """
    rows = execute_query_dict(pool, query, [params.timezone, *query_params])
    mapped = [
        {
            "date": row.get("date"),
            "turn_response_time": row.get("turn_response_time") or 0,
            "doc_response_time": row.get("doc_response_time") or 0,
        }
        for row in rows
    ]
    mapped.reverse()
    return mapped


def get_token_usage_stats(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> dict:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
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
    # Hardware samples are server-wide and carry no user, so filtering them by
    # user would always empty the result.
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
    # None means the resource was never sampled -- a machine with no GPU must
    # not read as a GPU sitting at 0%.
    return {
        "avg_cpu": _parse_optional_float(row.get("avg_cpu")),
        "avg_ram": _parse_optional_float(row.get("avg_ram")),
        "avg_gpu": _parse_optional_float(row.get("avg_gpu")),
        "max_cpu": _parse_optional_float(row.get("max_cpu")),
        "max_ram": _parse_optional_float(row.get("max_ram")),
        "max_gpu": _parse_optional_float(row.get("max_gpu")),
    }


def get_avg_chunks_per_query(
    pool: ThreadedConnectionPool, params: MetricsQueryParams
) -> float:
    conditions, query_params = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
    )
    query = f"""
    SELECT AVG(value) as avg_chunks
    FROM metrics
    {_append_and_conditions("WHERE tag = 'NUM_DOCS_RAG'", conditions)}
    """
    rows = execute_query_dict(pool, query, query_params)
    if not rows:
        return 0
    return rows[0].get("avg_chunks") or 0


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
    """Topics are language-independent; `lang` only picks the label to show."""
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
