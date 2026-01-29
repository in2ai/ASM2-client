from langgraph.graph import MessagesState

# TODO: think about needed information at each point of the graph


class State(MessagesState):
    # Add any keys needed beyond messages, which is pre-built
    user: str
    principals: str
    detected_lang: str
    pass
