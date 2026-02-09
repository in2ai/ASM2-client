"""FastAPI entry point for the LangGraph RAG agent.

Endpoints:
    POST /api/chat/stream  — SSE streaming chat
    POST /api/reindex      — Trigger vectorstore rebuild
    GET  /api/health       — Health check

Usage:
    uvicorn backend.api:app --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

# Ensure backend/ is on sys.path for graph imports
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
# Also add backend/graph so graph-internal imports work
graph_dir = backend_dir / "graph"
if str(graph_dir) not in sys.path:
    sys.path.insert(0, str(graph_dir))

load_dotenv(backend_dir / ".env")

from src.utils.nlp import init_nlp
from src.utils.rag import get_reranker
from src.metrics.metrics import Metrics, insert_metric
from graph.agent import build_graph
from graph.checkpointer import get_checkpointer


# ---------------------------------------------------------------------------
# Lifespan: initialize resources once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize NLP models (stanza, glotlid, nltk stopwords)
    print("[STARTUP] Initializing NLP resources...")
    init_nlp()
    print("[STARTUP] NLP ready.")

    # Initialize reranker
    print("[STARTUP] Loading reranker model...")
    app.state.reranker = get_reranker()
    print("[STARTUP] Reranker ready.")

    # Initialize checkpointer and build graph
    print("[STARTUP] Building agent graph...")
    checkpointer = get_checkpointer()
    app.state.graph = build_graph(checkpointer)
    print("[STARTUP] Agent graph ready.")

    # Vectorstore and QuestDB pool are optional — set to None if not available
    app.state.vectorstore = None
    app.state.questdb_pool = None
    app.state.sources = {}

    # Try to initialize vectorstore
    try:
        from src.connectors.store import EMBEDDINGS, QDRANT_COL, QDRANT_HOST
        from langchain_community.vectorstores import Qdrant
        from qdrant_client import QdrantClient

        client = QdrantClient(
            url=f"http://{QDRANT_HOST}:6333",
            grpc_port=6334,
            prefer_grpc=True,
        )
        if client.collection_exists(QDRANT_COL):
            app.state.vectorstore = Qdrant(client, QDRANT_COL, EMBEDDINGS)
            print("[STARTUP] Vectorstore connected.")
        else:
            print("[STARTUP] Vectorstore collection not found — search tool will be unavailable.")
    except Exception as e:
        print(f"[STARTUP] Vectorstore unavailable: {e}")

    # Try to initialize QuestDB pool
    try:
        import psycopg2.pool
        from src.metrics.connection import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

        app.state.questdb_pool = psycopg2.pool.SimpleConnectionPool(
            1, 5,
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, dbname=DB_NAME,
            connect_timeout=5,
        )
        print("[STARTUP] QuestDB pool ready.")
    except Exception as e:
        print(f"[STARTUP] QuestDB unavailable: {e}")

    # Hardware metrics background task
    hw_task = None
    try:
        hw_task = asyncio.create_task(_hardware_metrics_loop(app))
    except Exception:
        pass

    yield

    # Shutdown
    if hw_task:
        hw_task.cancel()
    if app.state.questdb_pool:
        app.state.questdb_pool.closeall()


app = FastAPI(title="ASM2 RAG Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Background task: hardware metrics
# ---------------------------------------------------------------------------

async def _hardware_metrics_loop(app: FastAPI, interval: int = 30):
    """Periodically log CPU/RAM/GPU usage to QuestDB."""
    while True:
        await asyncio.sleep(interval)
        pool = app.state.questdb_pool
        if pool is None:
            continue
        try:
            import psutil
            cpu = psutil.cpu_percent(interval=1)
            mem = psutil.virtual_memory().percent
            insert_metric(pool, Metrics.CPU_USAGE.value, cpu)
            insert_metric(pool, Metrics.RAM_USAGE.value, mem)

            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                if gpus:
                    insert_metric(pool, Metrics.GPU_USAGE.value, gpus[0].load * 100)
            except ImportError:
                pass
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"


# ---------------------------------------------------------------------------
# SSE streaming chat endpoint
# ---------------------------------------------------------------------------

@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest, request: Request):
    """Stream agent responses via Server-Sent Events."""
    graph = request.app.state.graph

    config = {
        "configurable": {
            "thread_id": req.thread_id,
            "vectorstore": request.app.state.vectorstore,
            "reranker": request.app.state.reranker,
            "sources": request.app.state.sources,
            "questdb_pool": request.app.state.questdb_pool,
        }
    }

    async def event_stream():
        try:
            async for event in graph.astream_events(
                {"messages": [HumanMessage(content=req.message)]},
                config=config,
                version="v2",
            ):
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    # Token streaming from the LLM
                    chunk = event["data"]["chunk"]
                    if hasattr(chunk, "content") and chunk.content:
                        payload = {"type": "token", "content": chunk.content}
                        yield f"data: {json.dumps(payload)}\n\n"

                elif kind == "on_tool_start":
                    payload = {
                        "type": "tool_call",
                        "tool": event["name"],
                        "args": event["data"].get("input", {}),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"

                elif kind == "on_tool_end":
                    output = event["data"].get("output", "")
                    if hasattr(output, "content"):
                        output = output.content
                    # Truncate long tool outputs for the SSE stream
                    output_str = str(output)[:2000]
                    payload = {"type": "tool_result", "result": output_str}
                    yield f"data: {json.dumps(payload)}\n\n"

            # Send done event
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            error_payload = {"type": "error", "message": str(e)}
            yield f"data: {json.dumps(error_payload)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Non-streaming chat endpoint (for simple integrations)
# ---------------------------------------------------------------------------

@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    """Non-streaming chat endpoint. Returns the final response."""
    graph = request.app.state.graph

    config = {
        "configurable": {
            "thread_id": req.thread_id,
            "vectorstore": request.app.state.vectorstore,
            "reranker": request.app.state.reranker,
            "sources": request.app.state.sources,
            "questdb_pool": request.app.state.questdb_pool,
        }
    }

    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=req.message)]},
        config=config,
    )

    last_message = result["messages"][-1]
    return {
        "response": last_message.content,
        "detected_language": result.get("detected_language"),
        "thread_id": req.thread_id,
    }


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health(request: Request):
    return {
        "status": "ok",
        "vectorstore": request.app.state.vectorstore is not None,
        "questdb": request.app.state.questdb_pool is not None,
        "reranker": request.app.state.reranker is not None,
    }


# ---------------------------------------------------------------------------
# Reindex trigger (placeholder)
# ---------------------------------------------------------------------------

@app.post("/api/reindex")
async def reindex(request: Request):
    """Trigger a vectorstore reindex. Currently a placeholder."""
    return {"status": "not_implemented", "message": "Reindex endpoint is a placeholder. Implement with Celery worker."}
