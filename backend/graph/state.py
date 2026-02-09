from typing import Annotated, Literal

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):
    """State for the RAG agent pipeline.

    - messages: Conversation history (managed by add_messages reducer)
    - detected_language: ISO-2 language code detected from the user's last message
    """
    messages: Annotated[list[AnyMessage], add_messages]
    detected_language: str
