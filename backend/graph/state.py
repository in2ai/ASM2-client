from langgraph.graph import MessagesState

# from pydantic import BaseModel, field_validator, ValidationError

# class PydanticState(BaseModel):
#    name: str
#    mood: str # "happy" or "sad"


# TODO: think about needed information at each point of the graph
# TODO: migration to PyDantic?


class State(MessagesState):
    # Add any keys needed beyond messages, which is pre-built
    user_id: str
    detected_lang: str
    summary: str
    pass
