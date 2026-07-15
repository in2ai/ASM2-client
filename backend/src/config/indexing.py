from typing import Any

from psycopg2.extras import Json
from psycopg2.pool import ThreadedConnectionPool

from src.indexing.deletion_guard import DeletionImpact
from src.metrics.connection import execute_query, execute_query_dict


def _guard_config_row(rows: list[tuple] | None) -> dict[str, Any]:
    rows = rows or []
    if not rows:
        raise RuntimeError("Indexing deletion guard configuration is missing")

    threshold, override_pending = rows[0]
    return {
        "threshold_percentage": float(threshold) if threshold is not None else None,
        "override_pending": bool(override_pending),
    }


def get_deletion_guard_config(
    pool: ThreadedConnectionPool,
) -> dict[str, Any]:
    rows = execute_query(
        pool,
        """
        SELECT threshold_percentage, override_pending
        FROM indexing_deletion_guard
        WHERE id = 1
        """,
    )

    return _guard_config_row(rows)


def set_deletion_threshold_percentage(
    pool: ThreadedConnectionPool,
    threshold_percentage: float | None,
) -> dict[str, Any]:
    """Update the threshold; clearing it also disarms any pending override."""
    rows = execute_query(
        pool,
        """
        UPDATE indexing_deletion_guard
        SET threshold_percentage = %(threshold)s,
            override_pending = override_pending AND %(threshold)s IS NOT NULL
        WHERE id = 1
        RETURNING threshold_percentage, override_pending
        """,
        {"threshold": threshold_percentage},
    )

    return _guard_config_row(rows)


def set_deletion_guard_override(
    pool: ThreadedConnectionPool,
    override_pending: bool,
) -> dict[str, Any]:
    rows = execute_query(
        pool,
        """
        UPDATE indexing_deletion_guard
        SET override_pending = %s
        WHERE id = 1
        RETURNING threshold_percentage, override_pending
        """,
        (override_pending,),
    )

    return _guard_config_row(rows)


def consume_deletion_guard_override(pool: ThreadedConnectionPool) -> bool:
    """Disarm the one-shot override and report whether it was armed."""
    rows = execute_query(
        pool,
        """
        UPDATE indexing_deletion_guard
        SET override_pending = FALSE
        WHERE id = 1 AND override_pending
        RETURNING id
        """,
    ) or []

    return bool(rows)


def create_indexing_alert(
    pool: ThreadedConnectionPool,
    impact: DeletionImpact,
) -> None:
    source_breakdown = [
        {
            "source": source_impact.source,
            "deleted_documents": source_impact.deleted_documents,
            "total_documents": source_impact.total_documents,
        }
        for source_impact in impact.source_breakdown
    ]

    execute_query(
        pool,
        """
        INSERT INTO indexing_alerts (
            source,
            deleted_documents,
            total_documents,
            percentage,
            threshold_percentage,
            source_breakdown
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            impact.source,
            impact.deleted_documents,
            impact.total_documents,
            impact.percentage,
            impact.threshold_percentage,
            Json(source_breakdown) if source_breakdown else None,
        ),
    )


def dismiss_indexing_alert(
    pool: ThreadedConnectionPool,
    user_id: str,
    alert_id: int,
) -> bool:
    """Hide an alert for one user; returns False when the alert does not exist."""
    rows = execute_query(
        pool,
        """
        INSERT INTO indexing_alert_dismissals (user_id, alert_id)
        SELECT %s, id
        FROM indexing_alerts
        WHERE id = %s
        ON CONFLICT (user_id, alert_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING alert_id
        """,
        (user_id, alert_id),
    ) or []

    return bool(rows)


def dismiss_all_indexing_alerts(
    pool: ThreadedConnectionPool,
    user_id: str,
) -> None:
    execute_query(
        pool,
        """
        INSERT INTO indexing_alert_dismissals (user_id, alert_id)
        SELECT %s, id
        FROM indexing_alerts
        ON CONFLICT (user_id, alert_id) DO NOTHING
        """,
        (user_id,),
    )


def list_indexing_alerts(
    pool: ThreadedConnectionPool,
    user_id: str,
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
            created_at,
            source_breakdown
        FROM indexing_alerts
        WHERE NOT EXISTS (
            SELECT 1
            FROM indexing_alert_dismissals
            WHERE indexing_alert_dismissals.alert_id = indexing_alerts.id
              AND indexing_alert_dismissals.user_id = %s
        )
        ORDER BY id DESC
        LIMIT %s
        """,
        (user_id, limit),
    )

    return [dict(row) for row in rows]
