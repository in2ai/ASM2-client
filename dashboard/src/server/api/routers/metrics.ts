import { Metrics } from "@/lib/metrics-constants";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  countMetrics,
  getActivityByDay,
  getAvgDocsPerQuery,
  getHourlyActivityPattern,
  getMetricsByTag,
  getResponseTimeTrend,
  getSystemHealthStats,
  getTokenUsageStats,
  getTotalActivityEvents,
  getUniqueUsers,
  getUserRoleDistribution,
  meanMetric,
  meanSessionLength,
  topKSearchTerms,
  topKTopics,
  type ActivityByDay,
  type HourlyActivity,
  type MetricsByTag,
  type MetricsQueryParams,
  type ResponseTimeTrend,
  type SearchTerm,
  type SystemHealthStats,
  type TokenUsageStats,
  type TopicCount,
} from "@/server/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const metricsQuerySchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

type MetricsQueryInput = z.infer<typeof metricsQuerySchema>;

const DEFAULT_TOP_RESULTS_LIMIT = 10;
const EXPORT_TOP_RESULTS_LIMIT = 100;
const SESSION_GAP_MINUTES = 10;

/**
 * Dashboard metrics data structure matching the SQL schema
 * Maps directly to the 4 tables: metrics, word_counts, topic_counts, user_activity
 */
interface DashboardMetrics {
  metrics: {
    response_time: number | null;
    total_count: number;
    by_tag: MetricsByTag[];
  };

  top_words: SearchTerm[];

  top_topics: TopicCount[];

  user_activity: {
    mean_session_length_seconds: number | null;
    unique_users: number;
    total_events: number;
    role_distribution: Record<string, number>;
    by_day: ActivityByDay[];
    hourly_pattern: HourlyActivity[];
  };

  rag_quality: {
    response_time_trend: ResponseTimeTrend[];
    token_usage: TokenUsageStats;
    system_health: SystemHealthStats;
    avg_docs_per_query: number;
  };

  metadata: {
    updatedAt: string;
  };
}

interface SharedMetricsData {
  meanResponseTime: number | null;
  searchTerms: SearchTerm[];
  topics: TopicCount[];
  sessionLength: number | null;
  uniqueUsersCount: number;
  totalEvents: number;
  roleDistribution: Record<string, number>;
  activityByDay: ActivityByDay[];
  hourlyPattern: HourlyActivity[];
  responseTimeTrend: ResponseTimeTrend[];
  tokenUsage: TokenUsageStats;
  systemHealth: SystemHealthStats;
  avgDocsPerQuery: number;
}

function formatDateForQuery(date?: Date): string | undefined {
  if (!date) {
    return undefined;
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Formats end date for query by adding 1 day to include the full end day.
 * Query filters compare timestamps against this date-boundary string.
 */
function formatEndDateForQuery(date?: Date): string | undefined {
  if (!date) {
    return undefined;
  }

  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  return formatDateForQuery(nextDay);
}

/**
 * Builds query parameters from input (date range only, no user filtering)
 */
function buildQueryParams(input: MetricsQueryInput): MetricsQueryParams {
  return {
    startDate: formatDateForQuery(input.startDate),
    endDate: formatEndDateForQuery(input.endDate),
  };
}

async function fetchSharedMetricsData(
  params: MetricsQueryParams,
  {
    searchTermsLimit,
    topicsLimit,
  }: {
    searchTermsLimit: number;
    topicsLimit: number;
  },
): Promise<SharedMetricsData> {
  const [
    meanResponseTime,
    searchTerms,
    topics,
    sessionLength,
    uniqueUsersCount,
    totalEvents,
    roleDistribution,
    activityByDay,
    hourlyPattern,
    responseTimeTrend,
    tokenUsage,
    systemHealth,
    avgDocsPerQuery,
  ] = await Promise.all([
    meanMetric(Metrics.LLM_RESPONSE_TIME, params),
    topKSearchTerms(searchTermsLimit, params),
    topKTopics(topicsLimit, params),
    meanSessionLength(SESSION_GAP_MINUTES, params),
    getUniqueUsers(params),
    getTotalActivityEvents(params),
    getUserRoleDistribution(params),
    getActivityByDay(params),
    getHourlyActivityPattern(params),
    getResponseTimeTrend(params),
    getTokenUsageStats(params),
    getSystemHealthStats(params),
    getAvgDocsPerQuery(params),
  ]);

  return {
    meanResponseTime,
    searchTerms,
    topics,
    sessionLength,
    uniqueUsersCount,
    totalEvents,
    roleDistribution,
    activityByDay,
    hourlyPattern,
    responseTimeTrend,
    tokenUsage,
    systemHealth,
    avgDocsPerQuery,
  };
}

function rethrowMetricsRouterError(
  scope: string,
  message: string,
  error: unknown,
): never {
  console.error(`[Metrics Router] ${scope}:`, error);

  if (error instanceof TRPCError) {
    throw error;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message,
    cause: error,
  });
}

export const metricsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ input }): Promise<DashboardMetrics> => {
      try {
        const params = buildQueryParams(input);

        const [
          { meanResponseTime, ...sharedData },
          metricsCount,
          metricsByTag,
        ] = await Promise.all([
          fetchSharedMetricsData(params, {
            searchTermsLimit: DEFAULT_TOP_RESULTS_LIMIT,
            topicsLimit: DEFAULT_TOP_RESULTS_LIMIT,
          }),
          countMetrics(params),
          getMetricsByTag(params),
        ]);

        return {
          metrics: {
            response_time: meanResponseTime,
            total_count: metricsCount,
            by_tag: metricsByTag,
          },
          top_words: sharedData.searchTerms,
          top_topics: sharedData.topics,
          user_activity: {
            mean_session_length_seconds: sharedData.sessionLength,
            unique_users: sharedData.uniqueUsersCount,
            total_events: sharedData.totalEvents,
            role_distribution: sharedData.roleDistribution,
            by_day: sharedData.activityByDay,
            hourly_pattern: sharedData.hourlyPattern,
          },
          rag_quality: {
            response_time_trend: sharedData.responseTimeTrend,
            token_usage: sharedData.tokenUsage,
            system_health: sharedData.systemHealth,
            avg_docs_per_query: sharedData.avgDocsPerQuery,
          },
          metadata: {
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        rethrowMetricsRouterError(
          "Error fetching metrics",
          "Unable to load metrics. Please try again later.",
          error,
        );
      }
    }),

  getStats: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ input }) => {
      try {
        const params = buildQueryParams(input);

        const [meanResponseTime, sessionLength, uniqueUsersCount, totalEvents] =
          await Promise.all([
            meanMetric(Metrics.LLM_RESPONSE_TIME, params),
            meanSessionLength(SESSION_GAP_MINUTES, params),
            getUniqueUsers(params),
            getTotalActivityEvents(params),
          ]);

        return {
          totalMetricsRecords: totalEvents,
          avgResponseTime: meanResponseTime ?? 0,
          avgSessionLength: sessionLength ?? 0,
          uniqueUsers: uniqueUsersCount,
        };
      } catch (error) {
        rethrowMetricsRouterError(
          "Error fetching stats",
          "Failed to calculate aggregated statistics",
          error,
        );
      }
    }),

  exportMetrics: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        const params = buildQueryParams(input);

        const {
          meanResponseTime,
          searchTerms,
          topics,
          sessionLength,
          uniqueUsersCount,
          totalEvents,
          roleDistribution,
          activityByDay,
          hourlyPattern,
          responseTimeTrend,
          tokenUsage,
          systemHealth,
          avgDocsPerQuery,
        } = await fetchSharedMetricsData(params, {
          searchTermsLimit: EXPORT_TOP_RESULTS_LIMIT,
          topicsLimit: EXPORT_TOP_RESULTS_LIMIT,
        });

        const exportData = {
          summary: {
            unique_users: uniqueUsersCount,
            total_events: totalEvents,
            avg_session_length_seconds: sessionLength ?? 0,
            avg_llm_response_time_ms: meanResponseTime ?? 0,
            avg_docs_per_query: avgDocsPerQuery,
          },
          token_usage: {
            llm_tokens_in: tokenUsage.llm_tokens_in,
            llm_tokens_out: tokenUsage.llm_tokens_out,
            rag_tokens_in: tokenUsage.rag_tokens_in,
            rag_tokens_out: tokenUsage.rag_tokens_out,
            total_tokens:
              tokenUsage.llm_tokens_in +
              tokenUsage.llm_tokens_out +
              tokenUsage.rag_tokens_in +
              tokenUsage.rag_tokens_out,
          },
          system_health: {
            avg_cpu_percent: systemHealth.avg_cpu,
            max_cpu_percent: systemHealth.max_cpu,
            avg_ram_percent: systemHealth.avg_ram,
            max_ram_percent: systemHealth.max_ram,
            avg_gpu_percent: systemHealth.avg_gpu,
            max_gpu_percent: systemHealth.max_gpu,
          },
          role_distribution: roleDistribution,
          activity_by_day: activityByDay,
          hourly_pattern: hourlyPattern,
          response_time_trend: responseTimeTrend,
          search_terms: searchTerms,
          topics,
        };

        return {
          data: exportData,
          metadata: {
            startDate: input.startDate?.toISOString(),
            endDate: input.endDate?.toISOString(),
            exportTimestamp: new Date().toISOString(),
            userId: ctx.userContext.userId,
          },
        };
      } catch (error) {
        rethrowMetricsRouterError(
          "Error exporting metrics",
          "Failed to export metrics data",
          error,
        );
      }
    }),
});
