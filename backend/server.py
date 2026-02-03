from fastapi import FastAPI
from contextlib import asynccontextmanager

from src.metrics.connection import get_questdb_pool
from src.connectors.store import get_vectordb
from src.utils.rag import *


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.vectorstore = get_vectordb()
    app.state.reranker = get_reranker()
    app.state.questdb_pool = get_questdb_pool()
    yield


app = FastAPI(title="ASM2", lifespan=lifespan)


@app.get("/chat")
async def chat(query: str, chat_id: str):
    sources = []        # TODO: get authenticated sources from QuestDB
    
    vectorstore = app.state.vectorstore
    reranker = app.state.reranker
    questdb_pool = app.state.questdb_pool

    messages, _, _, lang_code = prepare_rag_context(query, questdb_pool, vectorstore, reranker, sources)

    # Prepare LLM with structured output
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    structured_llm = llm.with_structured_output(RAGResponse)

    with TimedMetric(questdb_pool, Metrics.LLM_RESPONSE_TIME.value):
        response: RAGResponse = structured_llm.invoke(messages)

    full_response = response.answer

    if not full_response.strip():
        fallback_messages = {
            "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
            "en": "I couldn't find relevant information about that topic in the available sources.",
            "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
        }
        full_response = fallback_messages.get(lang_code, fallback_messages["es"])

    insert_metric(questdb_pool, Metrics.NUM_LLM_TOKENS_OUT.value, len(full_response.split()))

    # Add only the sources that the LLM selected
    if response.sources:
        sources_html = "<br><br><b>Fuentes:</b><ul>"
        for src in response.sources:
            if src.link:
                sources_html += f'<li><a href="{src.link}" target="_blank">{src.title}</a> ({src.source_type})</li>'
            else:
                sources_html += f"<li>{src.title} ({src.source_type})</li>"
        sources_html += "</ul>"
        full_response += sources_html

    return full_response
