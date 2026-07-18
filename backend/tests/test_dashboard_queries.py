from datetime import date

from src.metrics.dashboard_queries import (
    MetricsQueryParams,
    _append_and_conditions,
    _build_filter_conditions,
    build_query_params,
)


def test_build_query_params_normalizes_dates():
    params = build_query_params(date(2026, 1, 1), date(2026, 1, 31), None, None, None)

    assert params.start_date == "2026-01-01"
    # End date is normalized to the day after the requested (inclusive) range
    assert params.end_date == "2026-02-01"


def test_build_query_params_none_dates():
    params = build_query_params(None, None, "user-1", "admin", "es")

    assert params.start_date is None
    assert params.end_date is None
    assert params.user_id == "user-1"
    assert params.user_role == "admin"
    assert params.lang == "es"


def test_filter_conditions_use_exclusive_end_boundary():
    params = MetricsQueryParams(start_date="2026-01-01", end_date="2026-02-01")
    conditions, values = _build_filter_conditions(params)

    assert conditions == ["ts >= %s", "ts < %s"]
    assert values == ["2026-01-01", "2026-02-01"]


def test_filter_conditions_optional_fields():
    params = MetricsQueryParams(user_id="u", user_role="admin", lang="es")

    conditions, values = _build_filter_conditions(params)
    assert conditions == []
    assert values == []

    conditions, values = _build_filter_conditions(
        params,
        include_user_id=True,
        include_user_role=True,
        include_lang=True,
    )
    assert conditions == ["user_id = %s", "user_role = %s", "lang = %s"]
    assert values == ["u", "admin", "es"]


def test_append_and_conditions():
    query = "SELECT 1 FROM t WHERE 1=1"

    assert _append_and_conditions(query, []) == query
    assert (
        _append_and_conditions(query, ["a = %s", "b = %s"])
        == "SELECT 1 FROM t WHERE 1=1 AND a = %s AND b = %s"
    )
