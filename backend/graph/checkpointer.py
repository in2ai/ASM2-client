from langgraph.checkpoint.postgres import PostgresSaver
from psycopg import Connection

# TODO: clarify connection to postgresSQL DB
# # ref: https://medium.com/@dmitri.mahayana/chain-everything-with-langgraph-9a0f35b2d7a2
DB_URI = "postgresql://langgraph:langgraph@localhost:5432/langgraph"
# DB_URI = os.getenv("POSTGRES_URI")

# memory_db_uri = f"postgresql://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode=disable"
memory_connection_kwargs = {
    "autocommit": True,
    "prepare_threshold": 0,
}
conn = Connection.connect(DB_URI, **memory_connection_kwargs)

checkpointer = PostgresSaver(conn)
checkpointer.setup()
