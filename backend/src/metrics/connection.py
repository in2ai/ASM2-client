from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor

from src.config.env import get_env, get_int_env

# Environment variables from docker-compose
DB_HOST = get_env("QUESTDB_HOST", "questdb")
DB_PORT = get_int_env("QUESTDB_PORT", 8812)
DB_USER = get_env("QUESTDB_USER", "admin")
DB_PASSWORD = get_env("QUESTDB_PASSWORD", "quest")
DB_NAME = get_env("QUESTDB_DB", "qdb")


# Connection and query management
def get_questdb_pool():
    return ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME,
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
