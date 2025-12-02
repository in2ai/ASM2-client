from src.connection import execute_query

# ---------------------------------
# Queries
# ---------------------------------

def mean_metric(tag, user_id=None, user_role=None, start_date=None, end_date=None):
    params = [tag]
    query = "SELECT AVG(value) FROM metrics WHERE tag = %s"

    if start_date is not None:
        query += " AND ts >= %s"
        params.append(start_date)

    if end_date is not None:
        query += " AND ts <= %s"
        params.append(end_date)

    if user_id is not None:
        query += " AND user_id = %s"
        params.append(user_id)

    if user_role is not None:
        query += " AND user_role = %s"
        params.append(user_role)

    rows = execute_query(query, tuple(params))

    if not rows:
        return None

    return rows[0][0]


def top_k_search_terms(k=10, start_date=None, end_date=None, user_id=None, user_role=None):
    params = []
    query = "SELECT word, COUNT(*) AS cnt FROM word_counts WHERE 1=1"

    if start_date is not None:
        query += " AND ts >= %s"
        params.append(start_date)

    if end_date is not None:
        query += " AND ts <= %s"
        params.append(end_date)

    if user_id is not None:
        query += " AND user_id = %s"
        params.append(user_id)

    if user_role is not None:
        query += " AND user_role = %s"
        params.append(user_role)

    query += " GROUP BY word ORDER BY cnt DESC LIMIT %s"
    params.append(k)

    rows = execute_query(query, tuple(params))
    return rows or []


def mean_session_length(session_gap_minutes, start_date=None, end_date=None, user_role=None, user_id=None):
    if session_gap_minutes is None or session_gap_minutes <= 0:
        raise ValueError("session_gap_minutes must be > 0")

    gap_ms = int(session_gap_minutes * 60 * 1000)

    params = []
    where_clauses = []

    if start_date is not None:
        where_clauses.append("ts >= %s")
        params.append(start_date)

    if end_date is not None:
        where_clauses.append("ts <= %s")
        params.append(end_date)

    if user_id is not None:
        where_clauses.append("user_id = %s")
        params.append(user_id)

    if user_role is not None:
        where_clauses.append("user_role = %s")
        params.append(user_role)

    time_filter = ""

    if where_clauses:
        time_filter = "WHERE " + " AND ".join(where_clauses)

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
            SUM(CASE WHEN prev_ts IS NULL OR (ts - prev_ts) >= {gap_ms} THEN 1 ELSE 0 END)
                OVER (PARTITION BY user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
        FROM user_events
    )
    SELECT
        AVG(session_length) / 1000.0 AS mean_session_seconds
    FROM (
        SELECT
            user_id,
            session_id,
            MAX(ts) - MIN(ts) AS session_length
        FROM sessions
        GROUP BY user_id, session_id
    ) t
    """

    rows = execute_query(query, tuple(params))

    if not rows or rows[0][0] is None:
        return None

    return float(rows[0][0])