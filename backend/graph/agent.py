from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import ToolNode
from model import tool_list
from nodes.assistant import call_model as assistant
from nodes.pre_process import pre_process
from nodes.summarize_conversation import summarize_conversation
from edges.should_continue import should_continue
from state import State


def build_graph(checkpointer=None):
    builder = StateGraph(State)

    builder.add_node("pre_process", pre_process)
    builder.add_node("assistant", assistant)
    builder.add_node("tools", ToolNode(tool_list))
    builder.add_node("summarize_conversation", summarize_conversation)

    builder.add_edge(START, "pre_process")
    builder.add_edge("pre_process", "assistant")
    builder.add_conditional_edges("assistant", should_continue)
    builder.add_edge("tools", "assistant")

    return builder.compile(checkpointer=checkpointer)


# Module-level graph for local test.py
from checkpointer import get_checkpointer

graph = build_graph(get_checkpointer())
