from typing import Annotated

from langchain_core.messages import AnyMessage
from langgraph.graph import MessagesState
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

# TODO: think about needed information at each point of the graph


class State(TypedDict):
    user: str
    principals: str
    detected_lang: str

    messages: Annotated[list[AnyMessage], add_messages]
    pass


class State2(MessagesState):
    # Add any keys needed beyond messages, which is pre-built
    user: str
    principals: str
    detected_lang: str
    pass
