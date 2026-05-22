import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from src.utils.nlp import init_nlp
from graph.agent import build_graph, get_checkpointer
from graph.model import get_llm_with_tools
from src.config.auth import get_authenticated_admin_sources
from src.connectors.embeddings import LocalEmbedder
from src.connectors.llms import get_openai_llm
from src.connectors.store import get_vectordb
from src.metrics.connection import get_questdb_pool
from src.utils.rag import get_reranker


init_nlp()

LLM = get_openai_llm()
LLM_WITH_TOOLS = get_llm_with_tools(LLM)
VDB = get_vectordb(LocalEmbedder())
RERANKER = get_reranker()
GRAPH = build_graph(get_checkpointer())
QUESTDB_POOL = get_questdb_pool()
ADMIN_SOURCES = get_authenticated_admin_sources(QUESTDB_POOL)


def get_vectordb_search_output_in_latest_turn(messages: list[Any]) -> Any | None:
    last_human_index = next(
        (
            i
            for i in range(len(messages) - 1, -1, -1)
            if isinstance(messages[i], HumanMessage)
        ),
        -1,
    )

    if last_human_index == -1:
        return None

    for i in range(last_human_index + 1, len(messages)):
        message = messages[i]

        if not isinstance(message, AIMessage):
            continue

        for tool_call in message.tool_calls or []:
            if tool_call.get("name") != "vectordb_search":
                continue

            call_id = tool_call.get("id")

            for followup in messages[i + 1 :]:
                if isinstance(followup, ToolMessage) and followup.tool_call_id == call_id:
                    try:
                        return json.loads(followup.content)
                    
                    except:
                        return None

    return None


def call_rag(query: str):
    config: dict[str, Any] = {
        "configurable": {
            "llm": LLM,
            "llm_with_tools": LLM_WITH_TOOLS,
            "vectorstore": VDB,
            "reranker": RERANKER,
            "questdb_pool": QUESTDB_POOL,
            "sources": ADMIN_SOURCES,
        }
    }

    result = GRAPH.invoke(
        {"messages": [HumanMessage(content=query)]}, config
    )

    messages = result.get("messages") or []

    answer = str(messages[-1].content)
    search_results = get_vectordb_search_output_in_latest_turn(messages)

    return answer, search_results