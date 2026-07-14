from typing import Any

from psycopg2.pool import ThreadedConnectionPool

from src.indexing.deletion_guard import DeletionImpact
from src.metrics.connection import execute_query, execute_query_dict


def get_deletion_threshold_percentage(
    pool: ThreadedConnectionPool,
) -> float | None:
    rows = execute_query(
        pool,
        """
        SELECT threshold_percentage
        FROM indexing_deletion_guard
        WHERE id = 1
        """,
    ) or []

    if not rows:
        raise RuntimeError("Indexing deletion guard configuration is missing")

    threshold = rows[0][0]
    return float(threshold) if threshold is not None else None


def set_deletion_threshold_percentage(
    pool: ThreadedConnectionPool,
    threshold_percentage: float,
) -> float:
    rows = execute_query(
        pool,
        """
        UPDATE indexing_deletion_guard
        SET threshold_percentage = %s
        WHERE id = 1
        RETURNING threshold_percentage
        """,
        (threshold_percentage,),
    ) or []
    if not rows:
        raise RuntimeError("Indexing deletion guard configuration is missing")

    return float(rows[0][0])


def create_indexing_alert(
    pool: ThreadedConnectionPool,
    impact: DeletionImpact,
) -> None:
    execute_query(
        pool,
        """
        INSERT INTO indexing_alerts (
            source,
            deleted_documents,
            total_documents,
            percentage,
            threshold_percentage
        )
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            impact.source,
            impact.deleted_documents,
            impact.total_documents,
            impact.percentage,
            impact.threshold_percentage,
        ),
    )


def delete_indexing_alert(
    pool: ThreadedConnectionPool,
    alert_id: int,
) -> bool:
    rows = execute_query(
        pool,
        """
        DELETE FROM indexing_alerts
        WHERE id = %s
        RETURNING id
        """,
        (alert_id,),
    ) or []

    return bool(rows)


def delete_all_indexing_alerts(pool: ThreadedConnectionPool) -> None:
    execute_query(
        pool,
        """
        DELETE FROM indexing_alerts
        """,
    )


def list_indexing_alerts(
    pool: ThreadedConnectionPool,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    rows = execute_query_dict(
        pool,
        """
        SELECT
            id,
            source,
            deleted_documents,
            total_documents,
            percentage,
            threshold_percentage,
            created_at
        FROM indexing_alerts
        ORDER BY id DESC
        LIMIT %s
        """,
        (limit,),
    )

    return [dict(row) for row in rows]
