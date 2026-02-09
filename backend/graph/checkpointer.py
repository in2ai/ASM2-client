from langgraph.checkpoint.memory import MemorySaver

# Expected for current LangGraph versions; adjust if the API changes.

_checkpointer = None


def get_checkpointer():
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = MemorySaver()
    return _checkpointer
