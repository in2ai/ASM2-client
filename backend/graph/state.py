from typing import Annotated, Literal

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel


class State(BaseModel):
    detected_lang: Literal["es", "en", "gl"] = "es"
    summary: str = ""
    messages: Annotated[list[AnyMessage], add_messages]
