# TODO: build graph

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

# Here we import our tools/plug-ins for the agent system
from tools.test_tool import test_tool

# 1. LLM definition. OpenAI for now
# OPENAI_API_KEY defined in .env -> Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

llm = ChatOpenAI(
    model="gpt-4o-mini", temperature=0, api_key=os.getenv("OPENAI_API_KEY")
)

# 2. Add tools (hybrid search, specific uses)

tool_list = [test_tool]
llm_with_tools = llm.bind_tools(tool_list, parallel_tool_calls=False)


# TODO: substitute with actual state class State2
# 3. Single node definition; chatbot with tools.
# # System message
sys_msg = SystemMessage(
    content="You are a helpful assistant tasked with performing arithmetic on a set of inputs."
)


# Node
def assistant(state: MessagesState):
    return {"messages": [llm_with_tools.invoke([sys_msg] + state["messages"])]}


# def tool_calling_llm(state: MessagesState):
#     return {"messages": [llm_with_tools.invoke(state["messages"])]}


# 4. Build graph
builder = StateGraph(MessagesState)

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
react_graph = builder.compile()


# Graph is ready to be invoked! graph.invoke
# display(Image(react_graph.get_graph(xray=True).draw_mermaid_png()))
