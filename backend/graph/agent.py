import json 

from langchain_core.messages import AIMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres.aio import AsyncPostgresStore
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langchain_core.runnables import RunnableConfig

from .model import tool_list
from .nodes import call_model as assistant
from .nodes import detect_language_node, summarize_conversation
from .state import State


MAX_CONTEXT_TOKENS = 80_000


def get_checkpointer(pool):
    return AsyncPostgresSaver(pool)

def get_store(pool):
    return AsyncPostgresStore(pool)


_COUNTABLE_BLOCKS = {"text", "image_url"}


def should_continue(state: State, config: RunnableConfig):
    """Return the next node to execute."""
    messages = state.messages
    last_message = messages[-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"

    llm = config["configurable"]["llm"]

    try:
        total = llm.get_num_tokens_from_messages(messages)

    except ValueError:
        countable, reasoning = [], 0
        for m in messages:
            details = (getattr(m, "usage_metadata", None) or {}).get("output_token_details") or {}
            reasoning += details.get("reasoning", 0)

            if isinstance(m.content, list):
                blocks = [
                    b if not isinstance(b, dict) or b.get("type") in _COUNTABLE_BLOCKS
                    else {"type": "text", "text": json.dumps(b, default=str)}
                    for b in m.content
                    if not (isinstance(b, dict) and b.get("type") == "reasoning")
                ]
                m = m.model_copy(update={"content": blocks})
            countable.append(m)

        total = llm.get_num_tokens_from_messages(countable) + reasoning

    if total > MAX_CONTEXT_TOKENS:
        return "summarize_conversation"

    return END


def build_graph(checkpointer=None, store=None):
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

    return builder.compile(checkpointer=checkpointer, store=store)
