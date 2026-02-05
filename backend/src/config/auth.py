# Fake for now

from psycopg2.pool import ThreadedConnectionPool

from src.metrics.connection import execute_query


USER_ID = 'user in2ai'
USER_ROLE = 'admin in2ai'


def get_user_credentials(pool: ThreadedConnectionPool, user_id: str):
    query = """
    SELECT source, credentials
    FROM credentials
    LATEST ON issued_at PARTITION BY user_id, source
    WHERE 
        user_id = %s
        AND (expires_at IS NULL OR expires_at > NOW())
    """

    return execute_query(pool, query, (user_id,))


def get_credentials_to_refresh(pool: ThreadedConnectionPool):
    query = """
    SELECT user_id, source, credentials
    FROM credentials
    LATEST ON issued_at PARTITION BY user_id, source
    WHERE 
        expires_at > NOW()
        AND needs_refresh_at < NOW()
    """

    return execute_query(pool, query)