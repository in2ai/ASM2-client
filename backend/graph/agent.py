# TODO: build graph

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from tools import vectordb_search

# 1. LLM definition. OpenAI for now
# OPENAI_API_KEY defined in .env -> Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

llm = ChatOpenAI(
    model="gpt-4o-mini", temperature=0, api_key=os.getenv("OPENAI_API_KEY")
)

# 2. Add tools (hybrid search, specific uses)
llm_with_tools = llm
# llm_with_tools = llm.bind_tools([vectordb_search])


# 3. Single node definition; chatbot with tools.
def tool_calling_llm(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


# 4. Build graph
builder = StateGraph(MessagesState)
builder.add_node("tool_calling_llm", tool_calling_llm)
builder.add_edge(START, "tool_calling_llm")
builder.add_edge("tool_calling_llm", END)
graph = builder.compile()

# Graph is ready to be invoked! graph.invoke
