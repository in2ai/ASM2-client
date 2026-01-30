from langgraph.checkpoint.postgres import PostgresSaver
from psycopg import Connection

# TODO: clarify connection to postgresSQL DB
# # ref: https://medium.com/@dmitri.mahayana/chain-everything-with-langgraph-9a0f35b2d7a2

memory_db_uri = f"postgresql://{DB_USERNAME}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode=disable"
memory_connection_kwargs = {
    "autocommit": True,
    "prepare_threshold": 0,
}
pool = Connection.connect(memory_db_uri, **memory_connection_kwargs)

checkpointer = PostgresSaver(pool)
checkpointer.setup()
