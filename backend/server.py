import asyncio
import logging
import os
import json

from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from graph.model import get_llm_with_tools
from src.connectors.embeddings import get_configured_embeddings
from src.config.log import setup_logging
from src.config.auth import (
    add_credentials,
    get_authenticated_admin_sources,
    get_authenticated_sources,
    get_credentials_to_refresh,
    get_selected_authenticated_sources,
    get_selected_sources,
    set_selected_sources,
)
from src.config.logto_auth import AuthInfo, has_role
from src.connectors.source import DataSource
from src.config.sources import SOURCES
from src.connectors.store import (
    VDB_LOCK,
    build_vectordb_from_sources,
    get_vectordb,
)

from src.model.endpoints import *
from src.utils.helpers import periodic_task
from src.metrics.connection import get_pg_pool, get_questdb_pool
from src.metrics.metrics import (
    Metrics,
    TimedMetric,
    insert_metric,
    register_user_activity,
)
from src.metrics.dashboard_queries import (
    build_query_params,
    count_metrics,
    get_activity_by_day,
    get_avg_docs_per_query,
    get_hourly_activity_pattern,
    get_metrics_by_tag,
    get_response_time_trend,
    get_system_health_stats,
    get_token_usage_stats,
    get_total_activity_events,
    get_unique_users,
    get_user_role_distribution,
    mean_metric,
    mean_session_length,
    top_k_search_terms,
    top_k_topics,
)
from src.chat.store import ChatNotFoundError,PostgresChatStore, PostgresChatStore
from src.tracing import get_langfuse_handler
from src.utils.nlp import init_nlp
from src.utils.rag import get_reranker
from src.connectors.llms import get_configured_llm

from graph.agent import build_graph
from graph import get_checkpointer
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

# ---------------------------------
# App configuration
# ---------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_nlp()

    # Global shared data
    app.state.llm = get_configured_llm()
    app.state.llm_with_tools = get_llm_with_tools(app.state.llm)
    app.state.vectorstore = get_vectordb(get_configured_embeddings())
    app.state.reranker = get_reranker()
    app.state.questdb_pool = get_questdb_pool()
    app.state.pg_pool = get_pg_pool()

    # chat_db_path = os.getenv(
    #    "CHAT_DB_PATH", os.path.join(os.path.dirname(__file__), "chat_history.sqlite3")
    # )
    # app.state.chat_store =PostgresChatStore(chat_db_path)

    app.state.tsdb_chat_store = PostgresChatStore(app.state.pg_pool)

    # Async periodic jobs
    jobs = [
        extract_usage_metrics,  # Store CPU, RAM and GPU metrics
        update_vdb,  # Update VDB contents by scanning sources
        refresh_tokens,  # Refresh all valid access tokens near expiration
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
        app.state.pg_pool.closeall()


setup_logging()

app = FastAPI(title="ASM2", lifespan=lifespan)

cors_allow_origins = [
    origin.strip()
    for origin in (
        os.getenv("CORS_ALLOW_ORIGINS")
        or "http://localhost:3000,http://localhost:3001,http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/healthz",
    status_code=200,
    responses={503: {"description": "Service not ready"}},
)
async def healthcheck():
    questdb_pool = getattr(app.state, "questdb_pool", None)
    graph = getattr(app.state, "graph", None)

    if questdb_pool is None or graph is None:
        raise HTTPException(status_code=503, detail="Service not ready")

    return {"status": "ok"}

# ---------------------------------
# Periodic tasks
# ---------------------------------

def refresh_tokens():
    def refresh():
        if os.path.isfile(VDB_LOCK):
            logging.info("Refreshing access tokens...")

            questdb_pool = app.state.questdb_pool

            # Get admin authenticated sources and update DB
            credentials = get_credentials_to_refresh(questdb_pool)

            logging.info("Found %s tokens to refresh", len(credentials))

            for user_id, source, creds, is_admin in credentials:
                if source not in SOURCES:
                    continue

                source: DataSource = SOURCES[source](creds)

                if not source.login() or not source.refresh():
                    continue  # Invalid source

                # Add new credentials entry
                new_creds = source.raw_creds
                add_credentials(questdb_pool, user_id, source.name, new_creds, is_admin)

            logging.info("Finished token refresh job for %s credentials", len(credentials))

    periodic_task(refresh, 300)  # Once every five minutes


def run_vdb_update_once() -> None:
    import time

    if not os.path.isfile(VDB_LOCK):
        return

    logging.info("Updating VDB...")

    try:
        start_time = time.time()

        questdb_pool = app.state.questdb_pool
        embeddings = app.state.vectorstore.embeddings
        llm = app.state.llm

        # Get admin authenticated sources and update DB
        sources = get_authenticated_admin_sources(questdb_pool)

        logging.info(
            "Found %s valid admin sources for VDB update: %s",
            len(sources),
            [source.name for source in sources],
        )

        build_vectordb_from_sources(llm, embeddings, sources)

        elapsed = time.time() - start_time

        logging.info(f"VDB update job finished in {elapsed} seconds")

    except Exception:
        logging.exception("VDB update job failed")


def update_vdb():
    def update():
        run_vdb_update_once()

    periodic_task(update, 7000)  # Once an hour


def extract_usage_metrics():
    import GPUtil
    import psutil

    def calc():
        logging.info("Collecting hardware usage metrics...")

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
async def start_vdb_update(auth: AdminAuth):
    with open(VDB_LOCK, "w+"):
        pass

    current_task = getattr(app.state, "vdb_update_task", None)
    if current_task is not None and not current_task.done():
        return

    app.state.vdb_update_task = asyncio.create_task(asyncio.to_thread(run_vdb_update_once))


@app.post("/stop-vdb-update", status_code=200)
async def stop_vdb_update(auth: AdminAuth):
    try:
        os.remove(VDB_LOCK)

    except:
        pass


@app.get("/vdb-update-status", status_code=200)
async def is_vdb_update_active(auth: AdminAuth):
    return {"active": os.path.isfile(VDB_LOCK)}


@app.get("/sources/login-info", response_model=SourceLoginInfoModel, status_code=200)
async def get_source_login_info(auth: AuthenticatedAuth, source: str):
    source = validate_source(source)
    source_class = SOURCES[source]
    return source_class.login_info() or {}


@app.post("/login-source", status_code=200)
async def login_source(
    auth: AuthenticatedAuth,
    body: SourceLoginRequestModel,
):
    # Check source name
    source = validate_source(body.source)

    # Construct source instance
    source_class = SOURCES[source]
    source_instance = source_class(body.payload.model_dump_json(exclude_none=True))

    # Login in the source
    if not source_instance.login():
        raise HTTPException(500, detail=f"Authentication failed for source {source}")

    # Store credentials in database
    questdb_pool = app.state.questdb_pool
    user_id = auth.sub
    is_admin = has_role(auth, "admin")
    needs_refresh_at, expires_at = source_instance.expiry()

    add_credentials(
        questdb_pool,
        user_id,
        source,
        source_instance.raw_creds,
        is_admin,
        needs_refresh_at=needs_refresh_at,
        expires_at=expires_at,
    )


def build_sources_status(questdb_pool, user_id: str) -> dict[str, Any]:
    connected_sources = sorted(get_authenticated_sources(questdb_pool, user_id).keys())
    selected_sources = get_selected_sources(questdb_pool, user_id)
    connected_set = set(connected_sources)
    selected_connected_sources = sorted(
        source for source in selected_sources if source in connected_set
    )

    return {
        "connected_sources": connected_sources,
        "selected_sources": selected_connected_sources,
        "can_chat": len(selected_connected_sources) > 0,
    }


@app.get("/sources/status", response_model=SourcesStatusModel, status_code=200)
async def get_sources_status(auth: AuthenticatedAuth):
    questdb_pool = app.state.questdb_pool
    return build_sources_status(questdb_pool, auth.sub)


@app.put("/sources/selection", response_model=SourcesStatusModel, status_code=200)
async def update_sources_selection(
    auth: AuthenticatedAuth,
    body: SourceSelectionRequestModel,
):
    questdb_pool = app.state.questdb_pool
    connected_sources = sorted(get_authenticated_sources(questdb_pool, auth.sub).keys())
    connected_set = set(connected_sources)

    normalized_sources: list[str] = []
    for raw_source in body.selected_sources:
        source = validate_source(raw_source)
        if source not in connected_set:
            raise HTTPException(
                status_code=409,
                detail=f"Connect source before selecting it: {source}",
            )
        normalized_sources.append(source)

    set_selected_sources(questdb_pool, auth.sub, normalized_sources)
    return build_sources_status(questdb_pool, auth.sub)


@app.get("/authenticated-sources", status_code=200)
async def get_auth_sources(auth: AuthenticatedAuth):
    questdb_pool = app.state.questdb_pool
    return build_sources_status(questdb_pool, auth.sub)


@app.get("/chats", response_model=list[ChatSummaryModel])
async def list_chats(auth: AuthenticatedAuth):
    chat_store:PostgresChatStore = app.state.tsdb_chat_store
    return chat_store.list_chats(auth.sub)


@app.post("/chats", response_model=ChatDetailModel)
async def create_chat(auth: AuthenticatedAuth, payload: CreateChatRequestModel):
    chat_store:PostgresChatStore = app.state.tsdb_chat_store
    return chat_store.create_chat(auth.sub, title=payload.title)


def _get_chat_or_404(
    chat_store:PostgresChatStore, user_id: str, chat_id: str
) -> dict[str, Any]:
    chat = chat_store.get_chat(user_id, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


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


@app.get("/chats/{chat_id}", response_model=ChatDetailModel)
async def get_chat(auth: AuthenticatedAuth, chat_id: str):
    chat_store:PostgresChatStore = app.state.tsdb_chat_store
    return _get_chat_or_404(chat_store, auth.sub, chat_id)


@app.delete("/chats/{chat_id}", status_code=204)
async def delete_chat(auth: AuthenticatedAuth, chat_id: str):
    chat_store:PostgresChatStore = app.state.tsdb_chat_store

    try:
        chat_store.delete_chat(auth.sub, chat_id)
    except ChatNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chat not found") from exc


async def _run_chat_turn(auth: AuthInfo, chat_id: str, query: str) -> dict[str, Any]:
    questdb_pool = app.state.questdb_pool
    sources = get_selected_authenticated_sources(questdb_pool, auth.sub)
    if not sources:
        raise HTTPException(
            status_code=409,
            detail="Connect and select at least one source before chatting",
        )

    register_user_activity(questdb_pool)

    config: dict[str, Any] = {
        "configurable": {
            "thread_id": chat_id,
            "llm": app.state.llm,
            "llm_with_tools": app.state.llm_with_tools,
            "vectorstore": app.state.vectorstore,
            "reranker": app.state.reranker,
            "questdb_pool": questdb_pool,
            "sources": sources,
        }
    }

    langfuse_handler = get_langfuse_handler()

    if langfuse_handler is not None:
        config["callbacks"] = [langfuse_handler]
        config["run_name"] = "chat-turn"
        config["metadata"] = {
            "langfuse_user_id": auth.sub,
            "langfuse_session_id": chat_id,
            "langfuse_tags": ["asm2", "chat"],
        }

    with TimedMetric(questdb_pool, Metrics.LLM_RESPONSE_TIME.value):
        try:
            result = await app.state.graph.ainvoke(
                {"messages": [HumanMessage(content=query)]}, config
            )
        except Exception:
            logging.exception("Graph invocation failed")
            raise HTTPException(
                status_code=500, detail="Internal error processing your request"
            )

    messages = result.get("messages") or []
    if not messages:
        raise HTTPException(status_code=500, detail="No response generated")

    available_sources: list[dict[str, Any]] = []

    search_results = get_vectordb_search_output_in_latest_turn(messages)

    if search_results is not None:
        available_sources = search_results['sources']

    record_token_usage_metrics(questdb_pool, messages)
    return {
        "answer": str(messages[-1].content),
        "detected_lang": str(result.get("detected_lang", "es")),
        "sources": available_sources,
    }


@app.post("/chats/{chat_id}/messages", response_model=SendMessageResultModel)
async def send_chat_message(
    auth: AuthenticatedAuth,
    chat_id: str,
    payload: SendMessageRequestModel,
):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="content must not be empty")

    chat_store:PostgresChatStore = app.state.tsdb_chat_store
    _get_chat_or_404(chat_store, auth.sub, chat_id)

    try:
        user_message = chat_store.append_message(
            auth.sub,
            chat_id,
            "user",
            content,
            status="sent",
        )
    except ChatNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Chat not found") from exc

    result = await _run_chat_turn(auth, chat_id, content)

    assistant_message = chat_store.append_message(
        auth.sub,
        chat_id,
        "assistant",
        result["answer"],
        status="complete",
        metadata={
            "detected_lang": result["detected_lang"],
            "sources": result["sources"],
        },
    )
    chat = _get_chat_or_404(chat_store, auth.sub, chat_id)

    return {
        "chat": chat,
        "user_message": user_message,
        "assistant_message": assistant_message,
        "detected_lang": result["detected_lang"],
    }

# ---------------------------------
# Metrics endpoints
# ---------------------------------

def _ensure_valid_date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422, detail="startDate must be before or equal to endDate"
        )


def _fetch_shared_metrics_data(
    pool, params, search_terms_limit: int, topics_limit: int
):
    mean_response_time = mean_metric(pool, Metrics.LLM_RESPONSE_TIME.value, params)
    search_terms = top_k_search_terms(pool, params, search_terms_limit)
    topics = top_k_topics(pool, params, topics_limit)
    session_length = mean_session_length(pool, params, 10)
    unique_users_count = get_unique_users(pool, params)
    total_events = get_total_activity_events(pool, params)
    role_distribution = get_user_role_distribution(pool, params)
    activity_by_day = get_activity_by_day(pool, params)
    hourly_pattern = get_hourly_activity_pattern(pool, params)
    response_time_trend = get_response_time_trend(pool, params)
    token_usage = get_token_usage_stats(pool, params)
    system_health = get_system_health_stats(pool, params)
    avg_docs_per_query = get_avg_docs_per_query(pool, params)

    return {
        "mean_response_time": mean_response_time,
        "search_terms": search_terms,
        "topics": topics,
        "session_length": session_length,
        "unique_users_count": unique_users_count,
        "total_events": total_events,
        "role_distribution": role_distribution,
        "activity_by_day": activity_by_day,
        "hourly_pattern": hourly_pattern,
        "response_time_trend": response_time_trend,
        "token_usage": token_usage,
        "system_health": system_health,
        "avg_docs_per_query": avg_docs_per_query,
    }


def record_token_usage_metrics(questdb_pool, messages: list[Any]) -> None:
    try:
        for msg in messages:
            if isinstance(msg, AIMessage) and msg.usage_metadata:
                usage = msg.usage_metadata
                insert_metric(
                    questdb_pool,
                    Metrics.NUM_LLM_TOKENS_IN.value,
                    usage.get("input_tokens", 0),
                )
                insert_metric(
                    questdb_pool,
                    Metrics.NUM_LLM_TOKENS_OUT.value,
                    usage.get("output_tokens", 0),
                )
    except Exception:
        logging.warning("Failed to record token usage metrics", exc_info=True)


def validate_source(source: str) -> str:
    if source not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown source: {source}")

    return source
@app.get("/metrics/dashboard", response_model=DashboardMetricsResponseModel)
async def metrics_dashboard(
    auth: MetricsReadAuth,
    startDate: date | None = Query(default=None),
    endDate: date | None = Query(default=None),
    userId: str | None = Query(default=None),
    userRole: str | None = Query(default=None),
    lang: str | None = Query(default=None),
):
    _ensure_valid_date_range(startDate, endDate)

    questdb_pool = app.state.questdb_pool
    params = build_query_params(startDate, endDate, userId, userRole, lang)
    shared = _fetch_shared_metrics_data(questdb_pool, params, 10, 10)

    metrics_count = count_metrics(questdb_pool, params)
    metrics_by_tag = get_metrics_by_tag(questdb_pool, params)

    return {
        "metrics": {
            "response_time": shared["mean_response_time"],
            "total_count": metrics_count,
            "by_tag": metrics_by_tag,
        },
        "top_words": shared["search_terms"],
        "top_topics": shared["topics"],
        "user_activity": {
            "mean_session_length_seconds": shared["session_length"],
            "unique_users": shared["unique_users_count"],
            "total_events": shared["total_events"],
            "role_distribution": shared["role_distribution"],
            "by_day": shared["activity_by_day"],
            "hourly_pattern": shared["hourly_pattern"],
        },
        "rag_quality": {
            "response_time_trend": shared["response_time_trend"],
            "token_usage": shared["token_usage"],
            "system_health": shared["system_health"],
            "avg_docs_per_query": shared["avg_docs_per_query"],
        },
        "metadata": {
            "updatedAt": datetime.now().isoformat(),
        },
    }


@app.get("/metrics/stats", response_model=StatsResponseModel)
async def metrics_stats(
    auth: MetricsReadAuth,
    startDate: date | None = Query(default=None),
    endDate: date | None = Query(default=None),
    userId: str | None = Query(default=None),
    userRole: str | None = Query(default=None),
    lang: str | None = Query(default=None),
):
    _ensure_valid_date_range(startDate, endDate)

    questdb_pool = app.state.questdb_pool
    params = build_query_params(startDate, endDate, userId, userRole, lang)

    mean_response_time = mean_metric(
        questdb_pool, Metrics.LLM_RESPONSE_TIME.value, params
    )
    session_length = mean_session_length(questdb_pool, params, 10)
    unique_users_count = get_unique_users(questdb_pool, params)
    total_events = get_total_activity_events(questdb_pool, params)

    return {
        "totalMetricsRecords": total_events,
        "avgResponseTime": mean_response_time or 0,
        "avgSessionLength": session_length or 0,
        "uniqueUsers": unique_users_count,
    }


@app.get("/metrics/export", response_model=ExportMetricsResponseModel)
async def metrics_export(
    auth: MetricsExportAuth,
    startDate: date | None = Query(default=None),
    endDate: date | None = Query(default=None),
    userId: str | None = Query(default=None),
    userRole: str | None = Query(default=None),
    lang: str | None = Query(default=None),
):
    _ensure_valid_date_range(startDate, endDate)

    questdb_pool = app.state.questdb_pool
    params = build_query_params(startDate, endDate, userId, userRole, lang)
    shared = _fetch_shared_metrics_data(questdb_pool, params, 100, 100)

    token_usage = shared["token_usage"]
    total_tokens = (
        token_usage["llm_tokens_in"]
        + token_usage["llm_tokens_out"]
        + token_usage["rag_tokens_in"]
        + token_usage["rag_tokens_out"]
    )

    return {
        "data": {
            "summary": {
                "unique_users": shared["unique_users_count"],
                "total_events": shared["total_events"],
                "avg_session_length_seconds": shared["session_length"] or 0,
                "avg_llm_response_time_ms": shared["mean_response_time"] or 0,
                "avg_docs_per_query": shared["avg_docs_per_query"],
            },
            "token_usage": {
                "llm_tokens_in": token_usage["llm_tokens_in"],
                "llm_tokens_out": token_usage["llm_tokens_out"],
                "rag_tokens_in": token_usage["rag_tokens_in"],
                "rag_tokens_out": token_usage["rag_tokens_out"],
                "total_tokens": total_tokens,
            },
            "system_health": {
                "avg_cpu_percent": shared["system_health"]["avg_cpu"],
                "max_cpu_percent": shared["system_health"]["max_cpu"],
                "avg_ram_percent": shared["system_health"]["avg_ram"],
                "max_ram_percent": shared["system_health"]["max_ram"],
                "avg_gpu_percent": shared["system_health"]["avg_gpu"],
                "max_gpu_percent": shared["system_health"]["max_gpu"],
            },
            "role_distribution": shared["role_distribution"],
            "activity_by_day": shared["activity_by_day"],
            "hourly_pattern": shared["hourly_pattern"],
            "response_time_trend": shared["response_time_trend"],
            "search_terms": shared["search_terms"],
            "topics": shared["topics"],
        },
        "metadata": {
            "startDate": startDate.isoformat() if startDate else None,
            "endDate": endDate.isoformat() if endDate else None,
            "exportTimestamp": datetime.now().isoformat(),
            "userId": auth.sub,
        },
    }
