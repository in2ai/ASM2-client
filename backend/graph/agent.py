from langchain_core.messages import AIMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from .model import tool_list
from .nodes import call_model as assistant
from .nodes import detect_language_node, summarize_conversation
from .state import State


def get_checkpointer(pool):
    return AsyncPostgresSaver(pool)


def should_continue(state: State):
    """Return the next node to execute."""
    messages = state.messages
    last_message = messages[-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"

    if len(messages) > 6:
        return "summarize_conversation"

    return END


def build_graph(checkpointer=None):
    builder = StateGraph(State)
    tool_node = ToolNode(tool_list)

    builder.add_node("detect_language", detect_language_node)
    builder.add_node("assistant", assistant)
    builder.add_node("tools", tool_node)
    builder.add_node("summarize_conversation", summarize_conversation)

    builder.add_edge(START, "detect_language")
    builder.add_edge("detect_language", "assistant")
    builder.add_conditional_edges(
        "assistant",
        should_continue,
        {
            "tools": "tools",
            "summarize_conversation": "summarize_conversation",
            END: END,
        },
    )
    builder.add_edge("tools", "assistant")
    builder.add_edge("summarize_conversation", END)

    return builder.compile(checkpointer=checkpointer)
