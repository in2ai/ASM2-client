from langchain_core.messages import AIMessage
from state import State
from typing_extensions import Literal


def should_continue(state: State) -> Literal["tools", "summarize_conversation", "__end__"]:
    """Return the next node to execute."""

    messages = state.messages
    last_message = messages[-1]

    # If the assistant made tool calls, route to tools first
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"

    # If there are more than six messages, then we summarize the conversation
    if len(messages) > 6:
        return "summarize_conversation"

    # Otherwise we can just end
    return "__end__"
