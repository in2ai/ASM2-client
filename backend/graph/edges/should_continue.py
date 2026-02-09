from langchain_core.messages import AIMessage
from langgraph.graph import END
from state import State


def should_continue(state: State):
    """Return the next node to execute."""
    messages = state.messages
    last_message = messages[-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"

    if len(messages) > 6:
        return "summarize_conversation"

    return END
