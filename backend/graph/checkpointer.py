from langgraph.checkpoint.memory import InMemorySaver

_checkpointer = None


def get_checkpointer():
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = InMemorySaver()
    return _checkpointer
