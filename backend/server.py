import asyncio

from fastapi import FastAPI
from contextlib import asynccontextmanager

from src.utils.helpers import periodic_task
from src.metrics.connection import get_questdb_pool
from src.connectors.store import get_vectordb
from src.utils.rag import *

# ---------------------------------
# App configuration
# ---------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.vectorstore = get_vectordb()
    app.state.reranker = get_reranker()
    app.state.questdb_pool = get_questdb_pool()
    
    loop = asyncio.get_running_loop()
    app.state.metrics_task = loop.create_task(asyncio.to_thread(extract_usage_metrics))

    try:
        yield

    finally:
        app.state.metrics_task.cancel()

        try:
            await app.state.metrics_task
        
        except asyncio.CancelledError:
            pass


app = FastAPI(title="ASM2", lifespan=lifespan)

# ---------------------------------
# Periodic tasks
# ---------------------------------

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

@app.get("/chat")
async def chat(query: str, chat_id: str):
    sources = [] # TODO: get authenticated sources from QuestDB

    vectorstore = app.state.vectorstore
    reranker = app.state.reranker
    questdb_pool = app.state.questdb_pool

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
