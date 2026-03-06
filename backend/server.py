import asyncio
import os
import logging

from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.config.log import setup_logging
from src.config.auth import (
    add_credentials,
    get_authenticated_admin_sources,
    get_authenticated_sources,
    get_credentials_to_refresh,
    get_user_id,
    user_is_admin,
)
from src.config.logto_auth import AuthInfo, require_scopes
from src.connectors.source import DataSource
from src.config.sources import SOURCES
from src.connectors.store import VDB_LOCK, get_vectordb, build_vectordb_from_sources

from src.utils.helpers import periodic_task
from src.metrics.connection import get_questdb_pool
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


class MetricsByTagModel(BaseModel):
    tag: str
    avg_value: float
    count: int


class SearchTermModel(BaseModel):
    word: str
    count: int


class TopicCountModel(BaseModel):
    topic: str
    count: int


class ActivityByDayModel(BaseModel):
    date: str
    event_count: int
    unique_users: int


class HourlyActivityModel(BaseModel):
    hour: int
    event_count: int


class ResponseTimeTrendModel(BaseModel):
    date: str
    llm_response_time: float
    doc_response_time: float


class TokenUsageModel(BaseModel):
    llm_tokens_in: float
    llm_tokens_out: float
    rag_tokens_in: float
    rag_tokens_out: float


class SystemHealthModel(BaseModel):
    avg_cpu: float
    avg_ram: float
    avg_gpu: float
    max_cpu: float
    max_ram: float
    max_gpu: float


class MetricsSectionModel(BaseModel):
    response_time: float | None
    total_count: int
    by_tag: list[MetricsByTagModel]


class UserActivitySectionModel(BaseModel):
    mean_session_length_seconds: float | None
    unique_users: int
    total_events: int
    role_distribution: dict[str, int]
    by_day: list[ActivityByDayModel]
    hourly_pattern: list[HourlyActivityModel]


class RagQualitySectionModel(BaseModel):
    response_time_trend: list[ResponseTimeTrendModel]
    token_usage: TokenUsageModel
    system_health: SystemHealthModel
    avg_docs_per_query: float


class MetricsMetadataModel(BaseModel):
    updatedAt: str


class DashboardMetricsResponseModel(BaseModel):
    metrics: MetricsSectionModel
    top_words: list[SearchTermModel]
    top_topics: list[TopicCountModel]
    user_activity: UserActivitySectionModel
    rag_quality: RagQualitySectionModel
    metadata: MetricsMetadataModel


class StatsResponseModel(BaseModel):
    totalMetricsRecords: int
    avgResponseTime: float
    avgSessionLength: float
    uniqueUsers: int


class ExportSummaryModel(BaseModel):
    unique_users: int
    total_events: int
    avg_session_length_seconds: float
    avg_llm_response_time_ms: float
    avg_docs_per_query: float


class ExportTokenUsageModel(BaseModel):
    llm_tokens_in: float
    llm_tokens_out: float
    rag_tokens_in: float
    rag_tokens_out: float
    total_tokens: float


class ExportSystemHealthModel(BaseModel):
    avg_cpu_percent: float
    max_cpu_percent: float
    avg_ram_percent: float
    max_ram_percent: float
    avg_gpu_percent: float
    max_gpu_percent: float


class ExportDataModel(BaseModel):
    summary: ExportSummaryModel
    token_usage: ExportTokenUsageModel
    system_health: ExportSystemHealthModel
    role_distribution: dict[str, int]
    activity_by_day: list[ActivityByDayModel]
    hourly_pattern: list[HourlyActivityModel]
    response_time_trend: list[ResponseTimeTrendModel]
    search_terms: list[SearchTermModel]
    topics: list[TopicCountModel]


class ExportMetadataModel(BaseModel):
    startDate: str | None
    endDate: str | None
    exportTimestamp: str
    userId: str


class ExportMetricsResponseModel(BaseModel):
    data: ExportDataModel
    metadata: ExportMetadataModel


MetricsReadAuth = Annotated[AuthInfo, Depends(require_scopes(["metrics:read"]))]
MetricsExportAuth = Annotated[AuthInfo, Depends(require_scopes(["metrics:export"]))]


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


# ---------------------------------
# Periodic tasks
# ---------------------------------


def refresh_tokens():
    def refresh():
        if os.path.isfile(VDB_LOCK):
            logging.info("Refreshing access tokens...")

            questdb_pool = app.state.questdb_pool

            # Get admin authenticated sources and update DB
            credentials = get_credentials_to_refresh(questdb_pool) or []

            logging.info("Found %s tokens to refresh", len(credentials))

            for user_id, s, creds, is_admin in credentials:
                source: DataSource = SOURCES[s](creds)

                if not source.login() or not source.refresh():
                    continue  # Invalid source

                # Add new credentials entry
                new_creds = source.raw_creds
                add_credentials(questdb_pool, user_id, source.name, new_creds, is_admin)

            logging.info("Finished token refesh job", len(credentials))

    periodic_task(refresh, 300)  # Once every five minutes


def update_vdb():
    def update():
        if os.path.isfile(VDB_LOCK):
            logging.info("Updating VDB...")

            questdb_pool = app.state.questdb_pool

            # Get admin authenticated sources and update DB
            sources = get_authenticated_admin_sources(questdb_pool) or []

            logging.info("Found %s valid sources", len(sources))

            build_vectordb_from_sources(sources)

            logging.info("VDB update job finished", len(sources))

    periodic_task(update, 3600)  # Once an hour


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
async def start_vdb_update(logto_token: str):
    if not user_is_admin(logto_token):
        raise HTTPException(403)

    with open(VDB_LOCK, "w+"):
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
    return {"active": os.path.isfile(VDB_LOCK)}


@app.get("/login-source", status_code=200)
async def login_source(logto_token: str, source_token: str, source: str):
    # Check source name
    if source not in SOURCES:
        raise HTTPException(500, detail=f"Source {source} does not exist")

    source_instance: DataSource = SOURCES[source](source_token)

    if not source_instance.login():
        raise HTTPException(500, detail=f"Authentication failed for source {source}")

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
            raise HTTPException(
                status_code=500, detail="Internal error processing your request"
            )

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
        logger.warning("Failed to record token usage metrics", exc_info=True)

    return {"answer": answer, "detected_lang": detected_lang}
