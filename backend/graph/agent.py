# TODO: build graph

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

# 1. LLM definition. OpenAI for now
from model import llm
from state import State

# Here we import our tools/plug-ins for the agent system
from tools.test_tool import test_tool

# 2. Add tools (hybrid search, specific uses)

tool_list = [test_tool]
llm_with_tools = llm.bind_tools(tool_list, parallel_tool_calls=False)


# TODO: substitute with actual state class State2
# 3. Single node definition; chatbot with tools.
# # System message
sys_msg = SystemMessage(content="You are a helpful chatbot assistant.")


# 4. Build graph
# # Define a new graph

from edges.should_continue import should_continue
from nodes.assistant import call_model as assistant
from nodes.summarize_conversation import summarize_conversation

builder = StateGraph(State)

builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tool_list))
builder.add_node(summarize_conversation)

builder.add_edge(START, "assistant")
builder.add_conditional_edges("assistant", should_continue)
builder.add_edge("tools", "assistant")

memory = MemorySaver()
graph = builder.compile(checkpointer=memory)


# Graph is ready to be invoked! graph.invoke
graph.get_graph().print_ascii()
