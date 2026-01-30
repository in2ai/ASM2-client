# TODO: build graph

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

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


# Node
from langchain_core.messages import trim_messages


def assistant(state: State):
    messages = trim_messages(
        state["messages"],
        max_tokens=100,
        strategy="last",
        token_counter=ChatOpenAI(model="gpt-4o"),
        allow_partial=False,
    )
    return {"messages": [llm_with_tools.invoke([sys_msg] + messages)]}


# def tool_calling_llm(state: MessagesState):
#     return {"messages": [llm_with_tools.invoke(state["messages"])]}


# 4. Build graph
builder = StateGraph(State)

builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tool_list))

# Here, in the final product, a metric node should come before the LLM call
builder.add_edge(START, "assistant")
builder.add_conditional_edges(
    "assistant",
    # If the latest message (result) from assistant is a tool call -> tools_condition routes to tools
    # If the latest message (result) from assistant is a not a tool call -> tools_condition routes to END
    tools_condition,
)
builder.add_edge("tools", "assistant")

memory = MemorySaver()
graph = builder.compile(checkpointer=memory)


# Graph is ready to be invoked! graph.invoke
# display(Image(react_graph.get_graph(xray=True).draw_mermaid_png()))
