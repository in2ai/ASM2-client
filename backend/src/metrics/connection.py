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


def execute_query(pool: ThreadedConnectionPool, query, params=None):
    conn = pool.getconn()

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(query, params)

                if cur.description:
                    return cur.fetchall()

    finally:
        pool.putconn(conn)


def execute_query_dict(pool: ThreadedConnectionPool, query, params=None):
    conn = pool.getconn()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)

                if cur.description:
                    return list(cur.fetchall())

                return []

    finally:
        pool.putconn(conn)
