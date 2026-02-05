# Fake for now

from psycopg2.pool import ThreadedConnectionPool

from src.config.sources import SOURCES
from src.metrics.connection import execute_query


USER_ID = 'user in2ai'
USER_ROLE = 'admin in2ai'


def add_credentials(pool: ThreadedConnectionPool, user_id: str, source: str, credentials: str):
    query = """
    INSERT INTO credentials (user_id, source, credentials, issued_at, needs_refresh_at, expired_at)
    VALUES (%s, %s, %s, NOW(), NOW(), NOW())
    """

    # TODO: use correct times (fix after frontend is working)

    execute_query(pool, query, (user_id, source, credentials))


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


def get_credentials_to_refresh(pool: ThreadedConnectionPool):
    query = """
    SELECT user_id, source, credentials
    FROM credentials
    WHERE 
        expires_at > NOW()
        AND needs_refresh_at < NOW()
    LATEST ON issued_at PARTITION BY user_id, source
    """

    return execute_query(pool, query)


def user_is_admin(logto_token: str):
    # TODO: get info from Logto
    return True


def get_user_id(logto_token: str):
    # TODO: get real user id from API
    return logto_token


def get_authenticated_sources(pool: ThreadedConnectionPool, logto_token: str):
    # Extract raw credentials from the database
    user_id = get_user_id(logto_token)
    stored_credentials = get_user_credentials(pool, user_id)

    # Return only sources that were confirmed to be working
    unchecked_sources = [SOURCES[s](c) for s, c in stored_credentials]
    checked_sources = [s for s in unchecked_sources if s.login()]

    return checked_sources