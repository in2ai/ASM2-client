import os
from psycopg2.pool import ThreadedConnectionPool

# Environment variables from docker-compose
DB_HOST = os.getenv("QUESTDB_HOST", "questdb")
DB_PORT = int(os.getenv("QUESTDB_PORT", 8812))
DB_USER = os.getenv("QUESTDB_USER", "admin")
DB_PASSWORD = os.getenv("QUESTDB_PASSWORD", "quest")
DB_NAME = os.getenv("QUESTDB_DB", "qdb")

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
        connect_timeout=5
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
