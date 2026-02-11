import asyncio
import os
import logging

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from src.config.log import setup_logging
from src.config.auth import (
    add_credentials,
    get_authenticated_admin_sources,
    get_authenticated_sources,
    get_credentials_to_refresh,
    get_user_id,
    user_is_admin,
)
from src.connectors.source import DataSource
from src.config.sources import SOURCES
from src.connectors.store import VDB_LOCK, get_vectordb, build_vectordb_from_sources

from src.utils.helpers import periodic_task
from src.metrics.connection import get_questdb_pool
from src.metrics.metrics import Metrics, TimedMetric, insert_metric, register_user_activity
from src.utils.nlp import init_nlp
from src.utils.rag import get_reranker

from graph.agent import build_graph
from graph import get_checkpointer
from langchain_core.messages import AIMessage, HumanMessage

logger = logging.getLogger(__name__)


# ---------------------------------
# App configuration
# ---------------------------------

setup_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):

    init_nlp()
    # Global shared data
    app.state.vectorstore = get_vectordb()
    app.state.reranker = get_reranker()
    app.state.questdb_pool = get_questdb_pool()
    
    # Async periodic jobs
    jobs = [
        extract_usage_metrics,  # Store CPU, RAM and GPU metrics
        update_vdb,             # Update VDB contents by scanning sources
        refresh_tokens          # Refresh all valid access tokens near expiration
    ]

    app.state.graph = build_graph(get_checkpointer())


    loop = asyncio.get_running_loop()
    app.state.periodic_tasks = [loop.create_task(asyncio.to_thread(j)) for j in jobs]

    try:
        yield

    finally:
        # Cleanup before closing
        for j in app.state.periodic_tasks:
            j.cancel()

            try:
                await j

            except asyncio.CancelledError:
                pass

        app.state.questdb_pool.closeall()


app = FastAPI(title="ASM2", lifespan=lifespan)

# ---------------------------------
# Periodic tasks
# ---------------------------------

def refresh_tokens():
    def refresh():
        if os.path.isfile(VDB_LOCK):
            logging.info('Refreshing access tokens...')

            questdb_pool = app.state.questdb_pool

            # Get admin authenticated sources and update DB
            credentials = get_credentials_to_refresh(questdb_pool)

            logging.info('Found %s tokens to refresh', len(credentials))

            for user_id, s, creds, is_admin in credentials:
                source: DataSource = SOURCES[s](creds)

                if not source.login() or not source.refresh():
                    continue # Invalid source

                # Add new credentials entry
                new_creds = source.raw_creds
                add_credentials(questdb_pool, user_id, source.name, new_creds, is_admin)

            logging.info('Finished token refesh job', len(credentials))


    periodic_task(refresh, 300) # Once every five minutes


def update_vdb():
    def update():
        if os.path.isfile(VDB_LOCK):
            logging.info('Updating VDB...')

            questdb_pool = app.state.questdb_pool

            # Get admin authenticated sources and update DB
            sources = get_authenticated_admin_sources(questdb_pool)

            logging.info('Found %s valid sources', len(sources))

            build_vectordb_from_sources(sources)

            logging.info('VDB update job finished', len(sources))

    periodic_task(update, 3600) # Once an hour


def extract_usage_metrics():
    import GPUtil
    import psutil

    def calc():
        logging.info('Collecting hardware usage metrics...')

        questdb_pool = app.state.questdb_pool

        # CPU
        cpu_usage = psutil.cpu_percent(interval=1)
        insert_metric(questdb_pool, Metrics.CPU_USAGE.value, cpu_usage)

        # RAM
        mem = psutil.virtual_memory()
        insert_metric(questdb_pool, Metrics.RAM_USAGE.value, mem.percent)

        # GPU (if available)
        gpus = GPUtil.getGPUs()

        if len(gpus) > 0:
            insert_metric(questdb_pool, Metrics.GPU_USAGE.value, gpus[0].load * 100)

    periodic_task(calc, 30)

# ---------------------------------
# App endpoints
# ---------------------------------

@app.post("/start-vdb-update", status_code=200)
async def start_vdb_update(logto_token: str):
    if not user_is_admin(logto_token):
        raise HTTPException(403)
        
    with open(VDB_LOCK, 'w+'):
        pass


@app.post("/stop-vdb-update", status_code=200)
async def stop_vdb_update(logto_token: str):
    if not user_is_admin(logto_token):
        raise HTTPException(403)

    try:
        os.remove(VDB_LOCK)

    except:
        pass


@app.get("/vdb-update-status", status_code=200)
async def is_vdb_update_active(logto_token: str):
    if not user_is_admin(logto_token):
        raise HTTPException(403)
    return {
        'active': os.path.isfile(VDB_LOCK)
    }


@app.get("/login-source", status_code=200)
async def login_source(logto_token: str, source_token: str, source: str):
    # Check source name
    if source not in SOURCES:
        raise HTTPException(500, detail=f'Source {source} does not exist')

    source_instance: DataSource = SOURCES[source](source_token)

    if not source_instance.login():
        raise HTTPException(500, detail=f'Authentication failed for source {source}')

    # Store credentials in database
    questdb_pool = app.state.questdb_pool
    user_id = get_user_id(logto_token)
    is_admin = user_is_admin(logto_token)

    add_credentials(questdb_pool, user_id, source, source_token, is_admin)


@app.get("/chat")
async def chat(logto_token: str, query: str, chat_id: str):
    vectorstore = app.state.vectorstore
    reranker = app.state.reranker

    questdb_pool = app.state.questdb_pool
    sources = get_authenticated_sources(questdb_pool, logto_token)

    try:
        register_user_activity(questdb_pool)
    except Exception:
        logger.warning("Failed to record user activity", exc_info=True)

    config = {
        "configurable": {
            "thread_id": chat_id,
            "vectorstore": vectorstore,
            "reranker": reranker,
            "questdb_pool": questdb_pool,
            "sources": sources,
        }
    }

    with TimedMetric(questdb_pool, Metrics.LLM_RESPONSE_TIME.value):
        try:
            result = await app.state.graph.ainvoke(
                {"messages": [HumanMessage(content=query)]}, config
            )
        except Exception:
            logger.exception("Graph invocation failed")
            raise HTTPException(status_code=500, detail="Internal error processing your request")

    messages = result.get("messages") or []
    if not messages:
        raise HTTPException(status_code=500, detail="No response generated")
    answer = messages[-1].content
    detected_lang = result.get("detected_lang", "es")

    # Extract token usage from AIMessages
    try:
        for msg in result["messages"]:
            if isinstance(msg, AIMessage) and msg.usage_metadata:
                usage = msg.usage_metadata
                insert_metric(questdb_pool, Metrics.NUM_LLM_TOKENS_IN.value, usage.get("input_tokens", 0))
                insert_metric(questdb_pool, Metrics.NUM_LLM_TOKENS_OUT.value, usage.get("output_tokens", 0))
    except Exception:
        logger.warning("Failed to record token usage metrics", exc_info=True)

    return {"answer": answer, "detected_lang": detected_lang}
