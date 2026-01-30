import os
import psycopg2

# Environment variables from docker-compose
DB_HOST = os.getenv("QUESTDB_HOST", "questdb")
DB_PORT = int(os.getenv("QUESTDB_PORT", 8812))
DB_USER = os.getenv("QUESTDB_USER", "admin")
DB_PASSWORD = os.getenv("QUESTDB_PASSWORD", "quest")
DB_NAME = os.getenv("QUESTDB_DB", "qdb")

# Connection and query management
def get_connection():
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME,
            connect_timeout=5
        )

        return conn
    
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Could not connect to QuestDB: {e}")
        raise

def execute_query(query, params=None):
    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(query, params)

                if cur.description:
                    return cur.fetchall()
                
    finally:
        conn.close()