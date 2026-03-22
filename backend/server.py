import asyncio
import json
import logging
import os
import requests

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from google_auth_oauthlib.flow import Flow

from src.config.config import (
    CLIENT_SECRET_FILE,
    GDRIVE_ROOT,
    SCOPES,
)
from src.config.log import setup_logging
from src.config.auth import (
    add_credentials,
    disconnect_source,
    get_admin_credentials,
    get_authenticated_admin_sources,
    get_authenticated_sources,
    get_credentials_to_refresh,
    get_selected_authenticated_sources,
    get_selected_sources,
    normalize_source_key,
    set_selected_sources,
)
from src.config.logto_management import ensure_default_role_assigned
from src.config.logto_auth import AuthInfo, require_admin, require_auth, require_scopes
from src.connectors.source import DataSource
from src.config.sources import SOURCE_LABELS, SOURCES
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
from src.chat.store import ChatNotFoundError, ChatStore
from src.utils.nlp import init_nlp
from src.utils.rag import get_reranker, retrieve_and_rerank

from graph.agent import build_graph
from graph import get_checkpointer
from langchain_core.messages import AIMessage, HumanMessage

logger = logging.getLogger(__name__)
SHARED_REINDEX_JOB_KEY = "__shared__"


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
    chat_db_path = os.getenv(
        "CHAT_DB_PATH", os.path.join(os.path.dirname(__file__), "chat_history.sqlite3")
    )
    app.state.chat_store = ChatStore(chat_db_path)
    app.state.source_reindex_jobs = {}

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


class AuthBootstrapResponseModel(BaseModel):
    enabled: bool
    assigned: bool
    refresh_required: bool


class ChatMessageModel(BaseModel):
    id: str
    chat_id: str
    role: str
    content: str
    created_at: str
    status: str | None = None
    metadata: dict[str, Any] | None = None


class ChatSummaryModel(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    last_message_preview: str | None = None


class ChatDetailModel(ChatSummaryModel):
    messages: list[ChatMessageModel]


class CreateChatRequestModel(BaseModel):
    title: str | None = None


class SendMessageRequestModel(BaseModel):
    content: str


class SendMessageResultModel(BaseModel):
    chat: ChatDetailModel
    user_message: ChatMessageModel
    assistant_message: ChatMessageModel
    detected_lang: str


class ChatSourceModel(BaseModel):
    title: str
    source_type: str
    link: str | None = None


class SourceProviderStatusModel(BaseModel):
    key: str
    label: str
    configured: bool
    connected: bool
    selected: bool
    auth_mode: str
    account_label: str | None = None
    oauth_client_id: str | None = None
    last_error: str | None = None


class ReindexStatusModel(BaseModel):
    in_progress: bool
    last_started_at: str | None = None
    last_finished_at: str | None = None
    error: str | None = None
    available: bool
    message: str | None = None


class SourcesStatusModel(BaseModel):
    providers: list[SourceProviderStatusModel]
    connected_sources: list[str]
    selected_sources: list[str]
    can_chat: bool
    reindex: ReindexStatusModel


class SourceSelectionRequestModel(BaseModel):
    selected_sources: list[str]


class SourceConnectCompleteRequestModel(BaseModel):
    code: str | None = None
    redirect_uri: str | None = None


class SourceReindexRequestModel(BaseModel):
    sources: list[str] | None = None


class SourceOperationResultModel(BaseModel):
    success: bool
    message: str


MetricsReadAuth = Annotated[AuthInfo, Depends(require_scopes(["metrics:read"]))]
MetricsExportAuth = Annotated[AuthInfo, Depends(require_scopes(["metrics:export"]))]
AuthenticatedAuth = Annotated[AuthInfo, Depends(require_auth())]
AdminAuth = Annotated[AuthInfo, Depends(require_admin())]


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


def _record_user_activity(questdb_pool) -> None:
    try:
        register_user_activity(questdb_pool)
    except Exception:
        logger.warning("Failed to record user activity", exc_info=True)


def _record_token_usage_metrics(questdb_pool, messages: list[Any]) -> None:
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
        logger.warning("Failed to record token usage metrics", exc_info=True)


def _provider_auth_mode(provider: str) -> str:
    return {"drive": "authorization_code"}[provider]


def _get_drive_client_config() -> dict[str, Any] | None:
    if not os.path.isfile(CLIENT_SECRET_FILE):
        return None

    try:
        with open(CLIENT_SECRET_FILE, "r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    for client_type in ("web", "installed"):
        client_config = payload.get(client_type)
        if not isinstance(client_config, dict):
            continue
        if client_config.get("client_id") and client_config.get("client_secret"):
            return {client_type: client_config}

    return None


def _get_drive_oauth_client_id() -> str | None:
    client_config = _get_drive_client_config()
    if not client_config:
        return None

    client_type = next(iter(client_config))
    client_id = client_config[client_type].get("client_id")
    return client_id if isinstance(client_id, str) and client_id else None


def _build_drive_flow(redirect_uri: str) -> Flow:
    client_config = _get_drive_client_config()
    if not client_config:
        raise HTTPException(
            status_code=409,
            detail="Google Drive OAuth is not configured on the backend",
        )

    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = redirect_uri
    return flow


def _provider_is_configured(provider: str) -> bool:
    if provider == "drive":
        return _get_drive_client_config() is not None
    return False


def _validate_provider(provider: str) -> str:
    normalized = normalize_source_key(provider)
    if normalized not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    return normalized


def _validate_redirect_uri(redirect_uri: str | None) -> str:
    if not redirect_uri:
        raise HTTPException(status_code=422, detail="redirect_uri is required")

    parsed = urlparse(redirect_uri)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in cors_allow_origins:
        raise HTTPException(
            status_code=400, detail="redirect_uri origin is not allowed"
        )
    return redirect_uri


def _serialize_drive_credentials(
    credentials,
) -> tuple[str, datetime | None, datetime | None]:
    expires_at = credentials.expiry
    needs_refresh_at = (
        expires_at - timedelta(minutes=5) if expires_at is not None else None
    )
    serialized = json.dumps(
        {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": list(getattr(credentials, "scopes", []) or SCOPES),
        }
    )
    return serialized, needs_refresh_at, expires_at


def _get_shared_reindex_job() -> dict[str, Any]:
    return app.state.source_reindex_jobs.setdefault(SHARED_REINDEX_JOB_KEY, {})


def _has_connected_admin_source(provider: str) -> bool:
    questdb_pool = app.state.questdb_pool
    for source_key, credentials, _issued_at, _is_admin in get_admin_credentials(questdb_pool) or []:
        if normalize_source_key(source_key) != provider:
            continue
        try:
            parsed = json.loads(credentials) if credentials else {}
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and parsed:
            return True
    return False


def _build_reindex_status(auth: AuthInfo) -> ReindexStatusModel:
    job = _get_shared_reindex_job()
    available = True
    message = None

    if auth.role != "admin":
        available = False
        message = "Only admins can rebuild the shared Google Drive index."
    elif not GDRIVE_ROOT:
        available = False
        message = (
            "Google Drive indexing root is not configured. "
            "Set GDRIVE_ROOT or FOLDER_ID on the backend."
        )
    elif not _has_connected_admin_source("drive"):
        available = False
        message = (
            "Connect Google Drive with an admin account before reindexing the shared corpus."
        )

    return ReindexStatusModel(
        in_progress=bool(job.get("in_progress")),
        last_started_at=job.get("last_started_at"),
        last_finished_at=job.get("last_finished_at"),
        error=job.get("error"),
        available=available,
        message=message,
    )


def _build_sources_status(auth: AuthInfo) -> SourcesStatusModel:
    questdb_pool = app.state.questdb_pool
    all_connected = get_authenticated_sources(questdb_pool, auth.sub)
    selected = get_selected_sources(questdb_pool, auth.sub)
    connected = sorted(all_connected.keys())
    selected_sources = sorted(
        source for source in (selected or connected) if source in set(connected)
    )
    selected_set = set(selected_sources)
    connected_set = set(connected)

    providers = []
    for provider in sorted(SOURCES):
        source = all_connected.get(provider)
        providers.append(
            SourceProviderStatusModel(
                key=provider,
                label=SOURCE_LABELS.get(provider, provider.title()),
                configured=_provider_is_configured(provider),
                connected=provider in connected_set,
                selected=provider in selected_set,
                auth_mode=_provider_auth_mode(provider),
                account_label=getattr(source, "account_label", None),
                oauth_client_id=_get_drive_oauth_client_id()
                if provider == "drive"
                else None,
                last_error=getattr(source, "last_error", None),
            )
        )

    return SourcesStatusModel(
        providers=providers,
        connected_sources=connected,
        selected_sources=selected_sources,
        can_chat=bool(selected_sources),
        reindex=_build_reindex_status(auth),
    )


def _mark_source_selected(questdb_pool, user_id: str, provider: str) -> None:
    existing = get_selected_sources(questdb_pool, user_id)
    if existing is None:
        current = set(get_authenticated_sources(questdb_pool, user_id).keys())
    else:
        current = set(existing)
    current.add(provider)
    set_selected_sources(questdb_pool, user_id, sorted(current))


def _run_shared_reindex(source_keys: list[str] | None = None) -> None:
    status = _get_shared_reindex_job()
    try:
        questdb_pool = app.state.questdb_pool
        authenticated_list = get_authenticated_admin_sources(questdb_pool) or []
        authenticated = {source.name: source for source in authenticated_list}
        if source_keys:
            allowed = set(source_keys)
            authenticated = {
                key: source for key, source in authenticated.items() if key in allowed
            }

        if not authenticated:
            raise RuntimeError(
                "No connected admin Google Drive source is available to reindex the shared corpus."
            )

        build_vectordb_from_sources(list(authenticated.values()))
        status["last_finished_at"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        logger.exception("Shared source reindex failed")
        status["error"] = str(exc)
        status["last_finished_at"] = datetime.now(timezone.utc).isoformat()
    finally:
        status["in_progress"] = False


async def _run_chat_turn(auth: AuthInfo, chat_id: str, query: str) -> dict[str, Any]:
    questdb_pool = app.state.questdb_pool
    sources = get_selected_authenticated_sources(questdb_pool, auth.sub)
    if not sources:
        raise HTTPException(
            status_code=409,
            detail="Connect and select at least one source before chatting",
        )

    _record_user_activity(questdb_pool)

    config = {
        "configurable": {
            "thread_id": chat_id,
            "vectorstore": app.state.vectorstore,
            "reranker": app.state.reranker,
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

    available_sources: list[dict[str, Any]] = []
    try:
        _chunks, available_sources, _lang_code = retrieve_and_rerank(
            query,
            app.state.vectorstore,
            app.state.reranker,
            sources,
        )
    except Exception:
        logger.warning("Failed to collect chat source metadata", exc_info=True)

    _record_token_usage_metrics(questdb_pool, messages)
    return {
        "answer": str(messages[-1].content),
        "detected_lang": str(result.get("detected_lang", "es")),
        "sources": available_sources,
    }


def _get_chat_or_404(
    chat_store: ChatStore, user_id: str, chat_id: str
) -> dict[str, Any]:
    chat = chat_store.get_chat(user_id, chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


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
                provider = normalize_source_key(s)
                if provider not in SOURCES:
                    continue

                source: DataSource = SOURCES[provider](creds)

                if not source.login() or not source.refresh():
                    continue  # Invalid source

                # Add new credentials entry
                new_creds = source.raw_creds
                add_credentials(questdb_pool, user_id, source.name, new_creds, is_admin)

            logging.info("Finished token refresh job", len(credentials))

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


@app.post(
    "/auth/bootstrap",
    response_model=AuthBootstrapResponseModel,
    responses={503: {"description": "Unable to assign default Logto role"}},
)
async def auth_bootstrap(auth: AuthenticatedAuth):
    try:
        return ensure_default_role_assigned(auth.sub)
    except requests.RequestException:
        logger.exception("Failed to bootstrap default Logto role")
        raise HTTPException(
            status_code=503,
            detail="Unable to assign default Logto role",
        )
    except RuntimeError as exc:
        logger.warning("Default Logto role bootstrap is unavailable: %s", exc)
        return {
            "enabled": False,
            "assigned": False,
            "refresh_required": False,
        }


@app.post("/start-vdb-update", status_code=200)
async def start_vdb_update(auth: AdminAuth):
    with open(VDB_LOCK, "w+"):
        pass


@app.post("/stop-vdb-update", status_code=200)
async def stop_vdb_update(auth: AdminAuth):
    try:
        os.remove(VDB_LOCK)

    except:
        pass


@app.get("/vdb-update-status", status_code=200)
async def is_vdb_update_active(auth: AdminAuth):
    return {"active": os.path.isfile(VDB_LOCK)}


@app.get("/login-source", status_code=200)
async def login_source(auth: AuthenticatedAuth, source_token: str, source: str):
    # Check source name
    source = _validate_provider(source)

    source_instance: DataSource = SOURCES[source](source_token)

    if not source_instance.login():
        raise HTTPException(500, detail=f"Authentication failed for source {source}")

    # Store credentials in database
    questdb_pool = app.state.questdb_pool
    user_id = auth.sub
    is_admin = auth.role == "admin"

    add_credentials(questdb_pool, user_id, source, source_token, is_admin)
    _mark_source_selected(questdb_pool, user_id, source)


@app.get("/sources/status", response_model=SourcesStatusModel)
async def get_sources_status(auth: AuthenticatedAuth):
    return _build_sources_status(auth)


@app.put("/sources/selection", response_model=SourcesStatusModel)
async def update_sources_selection(
    auth: AuthenticatedAuth, payload: SourceSelectionRequestModel
):
    questdb_pool = app.state.questdb_pool
    connected = set(get_authenticated_sources(questdb_pool, auth.sub).keys())
    requested = {_validate_provider(source) for source in payload.selected_sources}
    invalid = requested - connected
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot select disconnected sources: {', '.join(sorted(invalid))}",
        )

    set_selected_sources(questdb_pool, auth.sub, sorted(requested))
    return _build_sources_status(auth)


@app.post("/sources/{provider}/connect", response_model=SourceOperationResultModel)
async def complete_source_connection(
    auth: AuthenticatedAuth,
    provider: str,
    payload: SourceConnectCompleteRequestModel,
):
    provider = _validate_provider(provider)
    questdb_pool = app.state.questdb_pool
    is_admin = auth.role == "admin"

    if provider == "drive":
        if not payload.code or not payload.redirect_uri:
            raise HTTPException(
                status_code=422, detail="code and redirect_uri are required"
            )

        redirect_uri = _validate_redirect_uri(payload.redirect_uri)
        flow = _build_drive_flow(redirect_uri)

        try:
            flow.fetch_token(code=payload.code)
        except Exception as exc:
            logger.warning("Google Drive OAuth exchange failed", exc_info=True)
            raise HTTPException(
                status_code=400, detail="Google Drive authorization exchange failed"
            ) from exc

        serialized, needs_refresh_at, expires_at = _serialize_drive_credentials(
            flow.credentials
        )
        validation_source: DataSource = SOURCES[provider](serialized)
        if not validation_source.login():
            detail = getattr(validation_source, "last_error", None)
            if detail:
                logger.warning(
                    "Google Drive validation failed after OAuth exchange: %s", detail
                )
            raise HTTPException(
                status_code=400,
                detail=(
                    detail
                    or "Google Drive connected, but validating Drive access failed. "
                    "Check that the Google Drive API is enabled in Google Cloud."
                ),
            )

        add_credentials(
            questdb_pool,
            auth.sub,
            provider,
            serialized,
            is_admin,
            needs_refresh_at=needs_refresh_at,
            expires_at=expires_at,
        )
        _mark_source_selected(questdb_pool, auth.sub, provider)
        return {"success": True, "message": "Google Drive connected"}

    raise HTTPException(status_code=404, detail=f"Provider {provider} is not available")


@app.post("/sources/{provider}/disconnect", response_model=SourcesStatusModel)
async def disconnect_provider(auth: AuthenticatedAuth, provider: str):
    provider = _validate_provider(provider)
    questdb_pool = app.state.questdb_pool
    disconnect_source(questdb_pool, auth.sub, provider, auth.role == "admin")
    existing = get_selected_sources(questdb_pool, auth.sub)
    if existing is None:
        selected = [
            source
            for source in get_authenticated_sources(questdb_pool, auth.sub).keys()
            if source != provider
        ]
    else:
        selected = [source for source in existing if source != provider]
    set_selected_sources(questdb_pool, auth.sub, selected)
    return _build_sources_status(auth)


@app.post("/sources/reindex", response_model=SourcesStatusModel)
async def reindex_sources(
    auth: AuthenticatedAuth, payload: SourceReindexRequestModel | None = None
):
    if auth.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admins can rebuild the shared Google Drive index",
        )

    if not GDRIVE_ROOT:
        raise HTTPException(
            status_code=409,
            detail=(
                "Google Drive indexing root is not configured. "
                "Set GDRIVE_ROOT or FOLDER_ID on the backend."
            ),
        )

    if not _has_connected_admin_source("drive"):
        raise HTTPException(
            status_code=409,
            detail=(
                "Connect Google Drive with an admin account before reindexing the shared corpus."
            ),
        )

    source_keys = None
    if payload and payload.sources:
        source_keys = [_validate_provider(source) for source in payload.sources]

    job = _get_shared_reindex_job()
    if job.get("in_progress"):
        raise HTTPException(
            status_code=409, detail="A reindex job is already in progress"
        )

    job.update(
        {
            "in_progress": True,
            "error": None,
            "last_started_at": datetime.now(timezone.utc).isoformat(),
            "last_finished_at": None,
        }
    )
    asyncio.create_task(asyncio.to_thread(_run_shared_reindex, source_keys))
    return _build_sources_status(auth)


@app.get("/chats", response_model=list[ChatSummaryModel])
async def list_chats(auth: AuthenticatedAuth):
    chat_store: ChatStore = app.state.chat_store
    return chat_store.list_chats(auth.sub)


@app.post("/chats", response_model=ChatDetailModel)
async def create_chat(auth: AuthenticatedAuth, payload: CreateChatRequestModel):
    chat_store: ChatStore = app.state.chat_store
    return chat_store.create_chat(auth.sub, title=payload.title)


@app.get("/chats/{chat_id}", response_model=ChatDetailModel)
async def get_chat(auth: AuthenticatedAuth, chat_id: str):
    chat_store: ChatStore = app.state.chat_store
    return _get_chat_or_404(chat_store, auth.sub, chat_id)


@app.post("/chats/{chat_id}/messages", response_model=SendMessageResultModel)
async def send_chat_message(
    auth: AuthenticatedAuth,
    chat_id: str,
    payload: SendMessageRequestModel,
):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="content must not be empty")

    chat_store: ChatStore = app.state.chat_store
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


@app.get("/chat")
async def chat(auth: AuthenticatedAuth, query: str, chat_id: str):
    content = query.strip()
    if not content:
        raise HTTPException(status_code=422, detail="query must not be empty")

    chat_store: ChatStore = app.state.chat_store
    chat_store.ensure_chat(auth.sub, chat_id)
    chat_store.append_message(auth.sub, chat_id, "user", content, status="sent")

    result = await _run_chat_turn(auth, chat_id, content)
    chat_store.append_message(
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

    return {
        "answer": result["answer"],
        "detected_lang": result["detected_lang"],
        "sources": result["sources"],
    }
