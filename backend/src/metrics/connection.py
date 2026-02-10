import os

import psycopg2
from psycopg2.pool import SimpleConnectionPool

# Environment variables from docker-compose
DB_HOST = os.getenv("QUESTDB_HOST", "questdb")
DB_PORT = int(os.getenv("QUESTDB_PORT", 8812))
DB_USER = os.getenv("QUESTDB_USER", "admin")
DB_PASSWORD = os.getenv("QUESTDB_PASSWORD", "quest")
DB_NAME = os.getenv("QUESTDB_DB", "qdb")


# Connection pool
def get_questdb_pool(minconn=1, maxconn=5):
    return SimpleConnectionPool(
        minconn,
        maxconn,
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME,
        connect_timeout=5,
    )


# Connection and query management
def get_connection():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME,
            connect_timeout=5,
        )

        return conn

    except psycopg2.OperationalError as e:
        print(f"[ERROR] Could not connect to QuestDB: {e}")
        raise


def execute_query(query, params=None, pool=None):
    """Execute a query using the provided pool or a one-off connection."""
    if pool is not None:
        conn = pool.getconn()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    if cur.description:
                        return cur.fetchall()
        finally:
            pool.putconn(conn)
    else:
        conn = get_connection()
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    if cur.description:
                        return cur.fetchall()
        finally:
            conn.close()
