"""LangGraph agent pipeline with pre/post processing wrapper.

Architecture:
    START -> pre_process -> agent (create_react_agent) -> post_process -> END

The pre_process node detects language. The agent node is a prebuilt ReAct agent
that decides when to call tools. The post_process node logs metrics.
"""

from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import create_react_agent

from checkpointer import get_checkpointer
from model import llm
from state import AgentState
from tools.vectordb_search import vectordb_search

from src.utils.nlp import detect_language, extract_search_terms, init_nlp
from src.utils.rag import get_rag_system_prompt
from src.utils.topic import resolve_topic_names
from src.connectors.store import QDRANT_PATH
from src.metrics.metrics import (
    Metrics,
    insert_metric,
    register_topics,
    register_user_activity,
    register_words,
)

# ---------------------------------------------------------------------------
# Tools available to the agent
# ---------------------------------------------------------------------------

tool_list = [vectordb_search]

# ---------------------------------------------------------------------------
# Pre-processing node: detect language
# ---------------------------------------------------------------------------

def pre_process(state: AgentState) -> dict:
    """Detect language from the user's last message and store in state."""
    last_message = state["messages"][-1]
    text = last_message.content if hasattr(last_message, "content") else str(last_message)

    try:
        lang_code = detect_language(text)
    except RuntimeError:
        # NLP not initialized — init now (safety fallback)
        init_nlp()
        lang_code = detect_language(text)

    return {"detected_language": lang_code}


# ---------------------------------------------------------------------------
# Agent node: create_react_agent with dynamic system prompt
# ---------------------------------------------------------------------------

def _make_system_prompt(state: AgentState) -> str:
    """Build dynamic system prompt using detected language from state."""
    lang_code = state.get("detected_language", "es")
    return get_rag_system_prompt(lang_code)


def agent_node(state: AgentState, config: RunnableConfig) -> dict:
    """Invoke the ReAct agent with a dynamic system prompt."""
    system_prompt = _make_system_prompt(state)

    # Build agent inline — create_react_agent returns a CompiledGraph
    agent = create_react_agent(
        llm,
        tool_list,
        prompt=SystemMessage(content=system_prompt),
    )

    # Invoke the agent with the current messages
    result = agent.invoke(
        {"messages": state["messages"]},
        config=config,
    )

    return {"messages": result["messages"]}


# ---------------------------------------------------------------------------
# Post-processing node: log metrics
# ---------------------------------------------------------------------------

def post_process(state: AgentState, config: RunnableConfig) -> dict:
    """Log metrics after the agent has responded."""
    pool = config["configurable"].get("questdb_pool")

    if pool is None:
        return {}

    try:
        # Register user activity
        register_user_activity(pool)

        # Extract and register search terms from the user's last human message
        lang_code = state.get("detected_language", "es")
        human_messages = [m for m in state["messages"] if hasattr(m, "type") and m.type == "human"]
        if human_messages:
            last_query = human_messages[-1].content
            search_terms = extract_search_terms(last_query, lang_code)
            register_words(pool, search_terms, lang_code)

    except Exception as e:
        print(f"[WARNING] Metrics logging failed: {e}")

    return {}


# ---------------------------------------------------------------------------
# Build the full graph: pre_process -> agent -> post_process
# ---------------------------------------------------------------------------

def build_graph(checkpointer=None):
    """Build the complete agent pipeline graph."""
    workflow = StateGraph(AgentState)

    workflow.add_node("pre_process", pre_process)
    workflow.add_node("agent", agent_node)
    workflow.add_node("post_process", post_process)

    workflow.add_edge(START, "pre_process")
    workflow.add_edge("pre_process", "agent")
    workflow.add_edge("agent", "post_process")
    workflow.add_edge("post_process", END)

    return workflow.compile(checkpointer=checkpointer)


# Build a default graph instance for direct usage / testing
checkpointer = get_checkpointer()
graph = build_graph(checkpointer)
