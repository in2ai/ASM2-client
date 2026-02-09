from edges.should_continue import should_continue
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from model import tool_list
from nodes.assistant import call_model as assistant
from nodes.pre_process import pre_process
from nodes.summarize_conversation import summarize_conversation
from state import State


def build_graph(checkpointer=None):
    builder = StateGraph(State)
    tool_node = ToolNode(tool_list)

    def tools_with_history(state: State, config):
        """Wrap ToolNode to inject conversation history into config for tools."""
        # LangGraph may pass either a dict-like state or a Pydantic State instance.
        if isinstance(state, dict):
            state_dict = state
            messages = state.get("messages", [])
        else:
            messages = getattr(state, "messages", [])
            state_dict = (
                state.model_dump()  # Pydantic v2
                if hasattr(state, "model_dump")
                else state.dict()   # Pydantic v1 fallback
            )

        enhanced_config = {
            **config,
            "configurable": {
                **config.get("configurable", {}),
                "conversation_history": messages,
            },
        }
        return tool_node.invoke(state_dict, enhanced_config)

    builder.add_node("pre_process", pre_process)
    builder.add_node("assistant", assistant)
    builder.add_node("tools", tools_with_history)
    builder.add_node("summarize_conversation", summarize_conversation)

    builder.add_edge(START, "pre_process")
    builder.add_edge("pre_process", "assistant")
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
