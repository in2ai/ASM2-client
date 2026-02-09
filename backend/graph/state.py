from typing import Annotated, Literal

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, field_validator


class State(BaseModel):
    # user_id: str // Not needed as of now
    detected_lang: Literal["es", "en", "gl"] = "es"
    summary: str = ""
    messages: Annotated[list[AnyMessage], add_messages]

    @field_validator("user_id")
    @classmethod
    def user_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("user_id must not be empty")
        return v
