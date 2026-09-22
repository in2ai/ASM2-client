import { useLogto } from '@logto/react'
import {
  keepPreviousData,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query'

import { API_RESOURCE, BACKEND_URL } from '@/lib/api'

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
  /** Whole turn in seconds, retrieval included. */
  turn_response_time: number
  /** The retrieval slice of that turn, in seconds. */
  doc_response_time: number
}

export interface TokenUsageStats {
  llm_tokens_in: number
  llm_tokens_out: number
  rag_tokens_in: number
  rag_tokens_out: number
}

/** `null` means the resource was never sampled, which is not 0% usage. */
export interface SystemHealthStats {
  avg_cpu: number | null
  avg_ram: number | null
  avg_gpu: number | null
  max_cpu: number | null
  max_ram: number | null
  max_gpu: number | null
}

export interface DashboardMetrics {
  metrics: {
    /** Mean seconds for a whole turn. */
    turn_response_time: number | null
    /** Assistant metric rows, excluding periodic hardware telemetry. */
    total_count: number
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
    avg_chunks_per_query: number
  }
  metadata: {
    updatedAt: string
  }
}

export interface StatsMetrics {
  totalMetricsRecords: number
  totalEvents: number
  avgTurnResponseTimeMs: number
  avgSessionLength: number
  uniqueUsers: number
}

export interface InsightsMetrics {
  top_words: SearchTerm[]
  top_topics: TopicCount[]
  metadata: {
    updatedAt: string
  }
}

export interface ExportMetrics {
  data: {
    summary: {
      unique_users: number
      total_events: number
      avg_session_length_seconds: number
      avg_turn_response_time_ms: number
      avg_chunks_per_query: number
    }
    token_usage: {
      llm_tokens_in: number
      llm_tokens_out: number
      rag_tokens_in: number
      rag_tokens_out: number
      total_tokens: number
    }
    system_health: {
      avg_cpu_percent: number | null
      max_cpu_percent: number | null
      avg_ram_percent: number | null
      max_ram_percent: number | null
      avg_gpu_percent: number | null
      max_gpu_percent: number | null
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
    getInsights: InsightsMetrics
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

/**
 * The viewer's IANA zone, so the server cuts day and hour buckets on the same
 * clock the labels are read on. Falls back to UTC, which is what the database
 * would have used anyway.
 */
function getViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
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
  params.set('tz', getViewerTimeZone())

  return params
}

function buildMetricsQueryKey(input: MetricsQueryInput): string {
  return buildSearchParams(input).toString()
}

function useAuthorizedFetch() {
  const { getAccessToken } = useLogto()

  return async function authorizedFetch<T>(
    path: string,
    input: MetricsQueryInput,
  ): Promise<T> {
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
      } catch {}

      throw new Error(`${response.status}: ${detail}`)
    }

    return (await response.json()) as T
  }
}

function useMetricsGetQuery(
  input: MetricsQueryInput,
  options?: Omit<
    UseQueryOptions<DashboardMetrics, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<DashboardMetrics, Error>({
    queryKey: ['metrics', 'dashboard', buildMetricsQueryKey(input)],
    queryFn: () =>
      authorizedFetch<DashboardMetrics>('/metrics/dashboard', input),
    placeholderData: keepPreviousData,
    ...options,
  })
}

function useMetricsStatsQuery(
  input: MetricsQueryInput,
  options?: Omit<UseQueryOptions<StatsMetrics, Error>, 'queryKey' | 'queryFn'>,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<StatsMetrics, Error>({
    queryKey: ['metrics', 'stats', buildMetricsQueryKey(input)],
    queryFn: () => authorizedFetch<StatsMetrics>('/metrics/stats', input),
    placeholderData: keepPreviousData,
    ...options,
  })
}

function useMetricsInsightsQuery(
  input: MetricsQueryInput,
  options?: Omit<
    UseQueryOptions<InsightsMetrics, Error>,
    'queryKey' | 'queryFn'
  >,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<InsightsMetrics, Error>({
    queryKey: ['metrics', 'insights', buildMetricsQueryKey(input)],
    queryFn: () => authorizedFetch<InsightsMetrics>('/metrics/insights', input),
    placeholderData: keepPreviousData,
    ...options,
  })
}

function useExportMetricsQuery(
  input: MetricsQueryInput,
  options?: Omit<UseQueryOptions<ExportMetrics, Error>, 'queryKey' | 'queryFn'>,
) {
  const authorizedFetch = useAuthorizedFetch()

  return useQuery<ExportMetrics, Error>({
    queryKey: ['metrics', 'export', buildMetricsQueryKey(input)],
    queryFn: () => authorizedFetch<ExportMetrics>('/metrics/export', input),
    ...options,
  })
}

export const api = {
  metrics: {
    get: {
      useQuery: useMetricsGetQuery,
    },
    getInsights: {
      useQuery: useMetricsInsightsQuery,
    },
    getStats: {
      useQuery: useMetricsStatsQuery,
    },
    exportMetrics: {
      useQuery: useExportMetricsQuery,
    },
  },
}
