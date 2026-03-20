import json
from datetime import datetime, timezone

from psycopg2.pool import ThreadedConnectionPool

from src.config.sources import SOURCES
from src.metrics.connection import execute_query


USER_ID = "user in2ai"
USER_ROLE = "admin in2ai"

SOURCE_ALIASES = {
    "gdrive": "drive",
    "drive": "drive",
    "GDrive": "drive",
    "Drive": "drive",
    "dropbox": "dropbox",
    "Dropbox": "dropbox",
    "onedrive": "onedrive",
    "Onedrive": "onedrive",
    "OneDrive": "onedrive",
}


def normalize_source_key(source: str) -> str:
    return SOURCE_ALIASES.get(source, source.lower())


def _is_missing_source_preferences_table_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "source_preferences" in message and "table does not exist" in message


def _collapse_records(rows):
    latest = {}
    for row in rows or []:
        normalized = normalize_source_key(row[0])
        previous = latest.get(normalized)
        if previous is None or (row[2] and previous[2] and row[2] > previous[2]):
            latest[normalized] = (normalized, row[1], row[2], row[3])
        elif previous is None:
            latest[normalized] = (normalized, row[1], row[2], row[3])
    return list(latest.values())


def _to_questdb_timestamp(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is None:
        return value

    return value.astimezone(timezone.utc).replace(tzinfo=None)


def add_credentials(
    pool: ThreadedConnectionPool,
    user_id: str,
    source: str,
    credentials: str,
    is_admin: bool,
    *,
    needs_refresh_at: datetime | None = None,
    expires_at: datetime | None = None,
):
    query = """
    INSERT INTO credentials (user_id, source, credentials, issued_at, needs_refresh_at, expires_at, is_admin)
    VALUES (%s, %s, %s, NOW(), %s, %s, %s)
    """

    execute_query(
        pool,
        query,
        (
            user_id,
            normalize_source_key(source),
            credentials,
            _to_questdb_timestamp(needs_refresh_at),
            _to_questdb_timestamp(expires_at),
            is_admin,
        ),
    )


def disconnect_source(
    pool: ThreadedConnectionPool, user_id: str, source: str, is_admin: bool
):
    add_credentials(
        pool,
        user_id,
        source,
        json.dumps({}),
        is_admin,
    )


def get_user_credentials(pool: ThreadedConnectionPool, user_id: str):
    query = """
    SELECT source, credentials, issued_at, is_admin
    FROM credentials
    WHERE 
        user_id = %s
        AND (expires_at IS NULL OR expires_at > NOW())
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return _collapse_records(execute_query(pool, query, (user_id,)))


def get_admin_credentials(pool: ThreadedConnectionPool):
    query = """
    SELECT source, credentials, issued_at, is_admin
    FROM credentials
    WHERE 
        is_admin = true
        AND (expires_at IS NULL OR expires_at > NOW())
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return _collapse_records(execute_query(pool, query))


def get_credentials_to_refresh(pool: ThreadedConnectionPool):
    query = """
    SELECT user_id, source, credentials, is_admin
    FROM credentials
    WHERE 
        (expires_at IS NULL OR expires_at > NOW())
        AND needs_refresh_at IS NOT NULL
        AND needs_refresh_at < NOW()
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return execute_query(pool, query)


def set_selected_sources(pool: ThreadedConnectionPool, user_id: str, sources: list[str]):
    query = """
    INSERT INTO source_preferences (user_id, selected_sources, updated_at)
    VALUES (%s, %s, NOW())
    """
    normalized = [normalize_source_key(source) for source in sources]
    execute_query(pool, query, (user_id, json.dumps(sorted(set(normalized)))))


def get_selected_sources(pool: ThreadedConnectionPool, user_id: str) -> list[str] | None:
    query = """
    SELECT selected_sources
    FROM source_preferences
    WHERE user_id = %s
    LATEST ON updated_at PARTITION BY user_id
    """
    try:
        rows = execute_query(pool, query, (user_id,)) or []
    except Exception as exc:
        if _is_missing_source_preferences_table_error(exc):
            return None
        raise

    if not rows:
        return None

    try:
        parsed = json.loads(rows[0][0])
    except (TypeError, json.JSONDecodeError):
        return None

    if not isinstance(parsed, list):
        return None

    return [normalize_source_key(str(source)) for source in parsed]


def get_authenticated_sources(pool: ThreadedConnectionPool, user_id: str):
    stored_credentials = get_user_credentials(pool, user_id)
    authenticated = {}

    for source_key, credentials, _issued_at, _is_admin in stored_credentials or []:
        source_class = SOURCES.get(source_key)
        if source_class is None:
            continue

        source = source_class(credentials)
        if source.login():
            authenticated[source.name] = source

    return authenticated


def get_selected_authenticated_sources(pool: ThreadedConnectionPool, user_id: str):
    authenticated = get_authenticated_sources(pool, user_id)
    selected = get_selected_sources(pool, user_id)
    if not selected:
        return authenticated

    return {
        source_key: source
        for source_key, source in authenticated.items()
        if source_key in set(selected)
    }


def get_authenticated_admin_sources(pool: ThreadedConnectionPool):
    stored_credentials = get_admin_credentials(pool)
    authenticated = []

    for source_key, credentials, _issued_at, _is_admin in stored_credentials or []:
        source_class = SOURCES.get(source_key)
        if source_class is None:
            continue

        source = source_class(credentials)
        if source.login():
            authenticated.append(source)

    return authenticated
