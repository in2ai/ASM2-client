export interface MetricsQueryParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  userRole?: string;
  lang?: string;
}

export interface SearchTerm {
  word: string;
  count: number;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface ActivityByDay {
  date: string;
  event_count: number;
  unique_users: number;
}

export interface HourlyActivity {
  hour: number;
  event_count: number;
}

export interface MetricsByTag {
  tag: string;
  avg_value: number;
  count: number;
}

export interface ResponseTimeTrend {
  date: string;
  llm_response_time: number;
  doc_response_time: number;
}

export interface TokenUsageStats {
  llm_tokens_in: number;
  llm_tokens_out: number;
  rag_tokens_in: number;
  rag_tokens_out: number;
}

export interface SystemHealthStats {
  avg_cpu: number;
  avg_ram: number;
  avg_gpu: number;
  max_cpu: number;
  max_ram: number;
  max_gpu: number;
}
