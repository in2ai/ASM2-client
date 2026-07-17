import logging
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor

from src.config.env import get_env, get_int_env

# Environment variables from docker-compose

PG_HOST = get_env("PG_HOST", "timescaledb")
PG_PORT = get_int_env("PG_PORT", 5432)
PG_USER = get_env("PG_USER", "postgres")
PG_PASSWORD = get_env("PG_PASSWORD", "")
PG_DB = get_env("PG_DB", "tsdb")


# Connection and query management


def get_pg_pool():
    return ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        dbname=PG_DB,
        connect_timeout=5,
    )


def execute_query(pool: ThreadedConnectionPool, query, params=None, max_attempts: int = 3):
    for attempt in range(1, max_attempts + 1):
        conn = pool.getconn()
        should_close = False

        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)

                    if cur.description:
                        return cur.fetchall()
                    return None

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            should_close = True
            logging.warning(
                "execute_query: connection failure on attempt %s/%s, discarding. error=%s",
                attempt, max_attempts, e,
            )
            # don't retry on the last attempt
            if attempt == max_attempts:
                raise

        finally:
            pool.putconn(conn, close=should_close)


def execute_query_dict(pool: ThreadedConnectionPool, query, params=None, max_attempts: int = 3): 
    for attempt in range(1, max_attempts + 1):
        conn = pool.getconn()
        should_close = False

        try:
            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(query, params)
 
                    if cur.description:
                        return list(cur.fetchall())
 
                    return []

        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            should_close = True
            logging.warning(
                "execute_query_dict: connection failure on attempt %s/%s, discarding. error=%s",
                attempt, max_attempts, e,
            )
            # don't retry on the last attempt
            if attempt == max_attempts:
                raise
 
        finally:
            pool.putconn(conn, close=should_close)