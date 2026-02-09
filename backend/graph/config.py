"""Configuration schema for the LangGraph agent pipeline.

RunnableConfig["configurable"] keys used by the agent and tools.
"""

from typing import Any, Dict, List, Optional

from typing_extensions import TypedDict

from src.connectors.source import DataSource


class GraphConfig(TypedDict, total=False):
    """Keys expected in RunnableConfig['configurable']."""

    # Thread / session
    thread_id: str

    # Shared resources (initialized at app startup, injected per request)
    vectorstore: Any             # Qdrant vectorstore instance
    reranker: Any                # CrossEncoder reranker model
    sources: Dict[str, DataSource]  # Connected data sources by name

    # QuestDB connection pool for metrics
    questdb_pool: Any
