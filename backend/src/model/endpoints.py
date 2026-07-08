from datetime import datetime

from pydantic import BaseModel
from typing import Annotated, Any

from fastapi import Depends

from src.config.logto_auth import (
    AuthInfo,
    require_admin,
    require_auth,
    require_dashboard_access,
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


class ChatMessageModel(BaseModel):
    id: str
    chat_id: str
    role: str
    content: str
    created_at: datetime
    status: str | None = None
    metadata: dict[str, Any] | None = None


class ChatSummaryModel(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
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


class SourcesStatusModel(BaseModel):
    connected_sources: list[str]
    selected_sources: list[str]
    vdb_indexing_active: bool
    can_chat: bool


class SourceLoginInfoModel(BaseModel):
    auth_mode: str | None = None
    oauth_client_id: str | None = None


class SourceSelectionRequestModel(BaseModel):
    selected_sources: list[str]


class SourceLoginPayloadModel(BaseModel):
    auth_token: str | None = None
    redirect_uri: str | None = None


class SourceLoginRequestModel(BaseModel):
    source: str
    payload: SourceLoginPayloadModel


class SourceReindexRequestModel(BaseModel):
    sources: list[str] | None = None


class SourceOperationResultModel(BaseModel):
    success: bool
    message: str


MetricsReadAuth = Annotated[AuthInfo, Depends(require_dashboard_access())]
MetricsExportAuth = Annotated[AuthInfo, Depends(require_dashboard_access())]
AuthenticatedAuth = Annotated[AuthInfo, Depends(require_auth())]
AdminAuth = Annotated[AuthInfo, Depends(require_admin())]
