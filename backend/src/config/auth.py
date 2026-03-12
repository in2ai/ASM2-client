# Fake for now

from psycopg2.pool import ThreadedConnectionPool

from src.config.sources import SOURCES
from src.metrics.connection import execute_query


USER_ID = "user in2ai"
USER_ROLE = "admin in2ai"


def add_credentials(
    pool: ThreadedConnectionPool,
    user_id: str,
    source: str,
    credentials: str,
    is_admin: bool,
):
    query = """
    INSERT INTO credentials (user_id, source, credentials, issued_at, needs_refresh_at, expires_at, is_admin)
    VALUES (%s, %s, %s, NOW(), NOW(), NOW(), %s)
    """

    # TODO: use correct times (fix after frontend is working)

    execute_query(pool, query, (user_id, source, credentials, is_admin))


def get_user_credentials(pool: ThreadedConnectionPool, user_id: str):
    query = """
    SELECT source, credentials
    FROM credentials
    WHERE 
        user_id = %s
        AND (expires_at IS NULL OR expires_at > NOW())
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return execute_query(pool, query, (user_id,))


def get_admin_credentials(pool: ThreadedConnectionPool):
    query = """
    SELECT source, credentials
    FROM credentials
    WHERE 
        is_admin = true
        AND (expires_at IS NULL OR expires_at > NOW())
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return execute_query(pool, query)


def get_credentials_to_refresh(pool: ThreadedConnectionPool):
    query = """
    SELECT user_id, source, credentials, is_admin
    FROM credentials
    WHERE 
        expires_at > NOW()
        AND needs_refresh_at < NOW()
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return execute_query(pool, query)


def get_authenticated_sources(pool: ThreadedConnectionPool, user_id: str):
    # Extract raw credentials from the database
    stored_credentials = get_user_credentials(pool, user_id)

    # Return only sources that were confirmed to be working
    unchecked_sources = [SOURCES[s](c) for s, c in (stored_credentials or [])]
    checked_sources = [s for s in unchecked_sources if s.login()]

    return checked_sources


def get_authenticated_admin_sources(pool: ThreadedConnectionPool):
    # Extract raw credentials from the database
    stored_credentials = get_admin_credentials(pool)

    # Return only sources that were confirmed to be working
    unchecked_sources = [SOURCES[s](c) for s, c in (stored_credentials or [])]
    checked_sources = [s for s in unchecked_sources if s.login()]

    return checked_sources
