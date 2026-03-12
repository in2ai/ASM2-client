import { useLogto } from '@logto/react'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'

import { API_RESOURCE, BACKEND_URL } from '@/lib/api'

export interface MetricsByTag {
  tag: string
  avg_value: number
  count: number
}

export interface SearchTerm {
  word: string
  count: number
}

export interface TopicCount {
  topic: string
  count: number
}

export interface ActivityByDay {
  date: string
  event_count: number
  unique_users: number
}

export interface HourlyActivity {
  hour: number
  event_count: number
}

export interface ResponseTimeTrend {
  date: string
  llm_response_time: number
  doc_response_time: number
}

export interface TokenUsageStats {
  llm_tokens_in: number
  llm_tokens_out: number
  rag_tokens_in: number
  rag_tokens_out: number
}

export interface SystemHealthStats {
  avg_cpu: number
  avg_ram: number
  avg_gpu: number
  max_cpu: number
  max_ram: number
  max_gpu: number
}

export interface DashboardMetrics {
  metrics: {
    response_time: number | null
    total_count: number
    by_tag: MetricsByTag[]
  }
  top_words: SearchTerm[]
  top_topics: TopicCount[]
  user_activity: {
    mean_session_length_seconds: number | null
    unique_users: number
    total_events: number
    role_distribution: Record<string, number>
    by_day: ActivityByDay[]
    hourly_pattern: HourlyActivity[]
  }
  rag_quality: {
    response_time_trend: ResponseTimeTrend[]
    token_usage: TokenUsageStats
    system_health: SystemHealthStats
    avg_docs_per_query: number
  }
  metadata: {
    updatedAt: string
  }
}

export interface StatsMetrics {
  totalMetricsRecords: number
  avgResponseTime: number
  avgSessionLength: number
  uniqueUsers: number
}

export interface ExportMetrics {
  data: {
    summary: {
      unique_users: number
      total_events: number
      avg_session_length_seconds: number
      avg_llm_response_time_ms: number
      avg_docs_per_query: number
    }
    token_usage: {
      llm_tokens_in: number
      llm_tokens_out: number
      rag_tokens_in: number
      rag_tokens_out: number
      total_tokens: number
    }
    system_health: {
      avg_cpu_percent: number
      max_cpu_percent: number
      avg_ram_percent: number
      max_ram_percent: number
      avg_gpu_percent: number
      max_gpu_percent: number
    }
    role_distribution: Record<string, number>
    activity_by_day: ActivityByDay[]
    hourly_pattern: HourlyActivity[]
    response_time_trend: ResponseTimeTrend[]
    search_terms: SearchTerm[]
    topics: TopicCount[]
  }
  metadata: {
    startDate?: string
    endDate?: string
    exportTimestamp: string
    userId: string
  }
}

export type RouterOutputs = {
  metrics: {
    get: DashboardMetrics
    getStats: StatsMetrics
    exportMetrics: ExportMetrics
  }
}

interface MetricsQueryInput {
  startDate?: Date
  endDate?: Date
  userId?: string
  userRole?: string
  lang?: string
}

function formatDateForQuery(date?: Date): string | undefined {
  if (!date) return undefined
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildSearchParams(input: MetricsQueryInput): URLSearchParams {
  const params = new URLSearchParams()

  const startDate = formatDateForQuery(input.startDate)
  const endDate = formatDateForQuery(input.endDate)

  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (input.userId?.trim()) params.set('userId', input.userId.trim())
  if (input.userRole?.trim()) params.set('userRole', input.userRole.trim())
  if (input.lang?.trim()) params.set('lang', input.lang.trim())

  return params
}

function useAuthorizedFetch() {
  const { getAccessToken } = useLogto()

  return async function authorizedFetch<T>(path: string, input: MetricsQueryInput): Promise<T> {
    const token = await getAccessToken(API_RESOURCE)
    if (!token) {
      throw new Error('UNAUTHORIZED: missing access token')
    }

    const params = buildSearchParams(input)
    const query = params.toString()
    const suffix = query ? `?${query}` : ''
    const url = `${BACKEND_URL}${path}${suffix}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        const payload = (await response.json()) as { detail?: string }
        detail = payload.detail || detail
      } catch {
      }

      throw new Error(`${response.status}: ${detail}`)
    }

    return (await response.json()) as T
  }
}

function useMetricsGetQuery(
  input: MetricsQueryInput,
  options?: Omit<UseQueryOptions<DashboardMetrics, Error>, 'queryKey' | 'queryFn'>,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<DashboardMetrics, Error>({
    queryKey: ['metrics', 'dashboard', input],
    queryFn: () => authorizedFetch<DashboardMetrics>('/metrics/dashboard', input),
    ...options,
  })
}

function useMetricsStatsQuery(
  input: MetricsQueryInput,
  options?: Omit<UseQueryOptions<StatsMetrics, Error>, 'queryKey' | 'queryFn'>,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<StatsMetrics, Error>({
    queryKey: ['metrics', 'stats', input],
    queryFn: () => authorizedFetch<StatsMetrics>('/metrics/stats', input),
    ...options,
  })
}

function useExportMetricsQuery(
  input: MetricsQueryInput,
  options?: Omit<UseQueryOptions<ExportMetrics, Error>, 'queryKey' | 'queryFn'>,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<ExportMetrics, Error>({
    queryKey: ['metrics', 'export', input],
    queryFn: () => authorizedFetch<ExportMetrics>('/metrics/export', input),
    ...options,
  })
}

export const api = {
  metrics: {
    get: {
      useQuery: useMetricsGetQuery,
    },
    getStats: {
      useQuery: useMetricsStatsQuery,
    },
    exportMetrics: {
      useQuery: useExportMetricsQuery,
    },
  },
}
