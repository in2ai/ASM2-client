import asyncio
import os

from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from langchain_openai import ChatOpenAI

from src.config.auth import add_credentials, get_user_id, get_authenticated_sources, user_is_admin
from src.connectors.source import DataSource
from src.config.sources import SOURCES
from src.utils.helpers import periodic_task
from src.metrics.connection import get_questdb_pool
from src.connectors.store import VDB_LOCK, get_vectordb, build_vectordb_from_sources
from src.metrics.metrics import Metrics, TimedMetric, insert_metric
from src.utils.rag import RAGResponse, prepare_rag_context, get_reranker

# ---------------------------------
# App configuration
# ---------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Global shared data
    app.state.vectorstore = get_vectordb()
    app.state.reranker = get_reranker()
    app.state.questdb_pool = get_questdb_pool()
    
    # Async periodic jobs
    jobs = [
        extract_usage_metrics,  # Store CPU, RAM and GPU metrics
        update_vdb,             # Update VDB contents by scanning sources
    ]

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

def update_vdb():
    def update():
        if os.path.isfile(VDB_LOCK):
            questdb_pool = app.state.questdb_pool
            admin_id = '' # TODO: find way to get admin user id

            # Get admin authenticated sources and update DB
            sources = get_authenticated_sources(questdb_pool, admin_id)

            build_vectordb_from_sources(sources)

    periodic_task(update, 3600) # Once an hour


def extract_usage_metrics():
    import GPUtil
    import psutil

    def calc():    
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

@app.get("/start-vdb-update", status_code=200)
async def start_vdb_update(logto_token: str):
    if not user_is_admin(logto_token):
        raise HTTPException(400)
    
    with open(VDB_LOCK, 'w+'):
        pass


@app.get("/stop-vdb-update", status_code=200)
async def start_vdb_update(logto_token: str):
    if not user_is_admin(logto_token):
        raise HTTPException(400)
    
    try:
        os.remove(VDB_LOCK)

    except:
        pass


@app.get("/login-source", status_code=200)
async def login_source(logto_token: str, source_token: str, source: str):
    # Check source name
    if source not in SOURCES:
        raise HTTPException(500, detail=f'Source {source} does not exist')

    # Check source token validity 
    source_instance: DataSource = SOURCES[source](source_token)

    if not source_instance.login():
        raise HTTPException(500, detail=f'Authentication failed for source {source}')
    
    # Store credentials in database
    questdb_pool = app.state.questdb_pool
    user_id = get_user_id(logto_token)

    add_credentials(questdb_pool, user_id, source, source_token)


@app.get("/chat")
async def chat(logto_token: str, query: str, chat_id: str):
    vectorstore = app.state.vectorstore
    reranker = app.state.reranker
    questdb_pool = app.state.questdb_pool

    sources = get_authenticated_sources(questdb_pool, logto_token)

    messages, _, _, lang_code = prepare_rag_context(query, questdb_pool, vectorstore, reranker, sources)

    # Prepare LLM with structured output
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    structured_llm = llm.with_structured_output(RAGResponse)

    with TimedMetric(questdb_pool, Metrics.LLM_RESPONSE_TIME.value):
        response: RAGResponse = structured_llm.invoke(messages)

    # Fallback response
    if not response.answer.strip():
        fallback_messages = {
            "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
            "en": "I couldn't find relevant information about that topic in the available sources.",
            "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
        }

        response.answer = fallback_messages.get(lang_code, fallback_messages["es"])

    # TODO: collect usage metadata from the structured output instead
    num_out_tokens = llm.get_num_tokens(response.answer)
    insert_metric(questdb_pool, Metrics.NUM_LLM_TOKENS_OUT.value, num_out_tokens)

    return response
