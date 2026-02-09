from langchain_core.messages import HumanMessage
from state import State
from src.utils.nlp import detect_language


def pre_process(state: State):
    """Detect the language of the last user message."""
    for msg in reversed(state.messages):
        if isinstance(msg, HumanMessage):
            detected = detect_language(msg.content)
            return {"detected_lang": detected}

    return {"detected_lang": "es"}
