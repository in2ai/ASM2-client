import os

from langgraph.checkpoint.postgres import PostgresSaver

DB_URI = os.getenv("POSTGRES_URI", "postgresql://langgraph:langgraph@localhost:5432/langgraph")

_checkpointer = None


def get_checkpointer() -> PostgresSaver:
    """Lazy initialization of the PostgreSQL checkpointer."""
    global _checkpointer

    if _checkpointer is not None:
        return _checkpointer

    try:
        _checkpointer = PostgresSaver.from_conn_string(DB_URI)
        _checkpointer.setup()
        return _checkpointer
    except Exception as e:
        print(f"[WARNING] Could not connect to PostgreSQL for checkpointing: {e}")
        print("[WARNING] Running without persistent memory (using MemorySaver).")
        from langgraph.checkpoint.memory import MemorySaver
        _checkpointer = MemorySaver()
        return _checkpointer
