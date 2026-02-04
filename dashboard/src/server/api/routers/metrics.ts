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

function formatDateForQuery(date?: Date): string | undefined {
  if (!date) return undefined;
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats end date for query by adding 1 day to include the full end day
 * Since queries use ts < endDate, we need the day after to include all records from endDate
 */
function formatEndDateForQuery(date?: Date): string | undefined {
  if (!date) return undefined;
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  return formatDateForQuery(nextDay);
}

/**
 * Builds query parameters from input (date range only, no user filtering)
 */
function buildQueryParams(input: {
  startDate?: Date;
  endDate?: Date;
}): MetricsQueryParams {
  return {
    startDate: formatDateForQuery(input.startDate),
    endDate: formatEndDateForQuery(input.endDate),
  };
}

export const metricsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ input }): Promise<DashboardMetrics> => {
      try {
        const params = buildQueryParams(input);

        const [
          meanResponseTime,
          metricsCount,
          metricsByTag,
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
          countMetrics(params),
          getMetricsByTag(params),
          topKSearchTerms(10, params),
          topKTopics(10, params),
          meanSessionLength(10, params),
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
          metrics: {
            response_time: meanResponseTime,
            total_count: metricsCount,
            by_tag: metricsByTag,
          },
          top_words: searchTerms,
          top_topics: topics,
          user_activity: {
            mean_session_length_seconds: sessionLength,
            unique_users: uniqueUsersCount,
            total_events: totalEvents,
            role_distribution: roleDistribution,
            by_day: activityByDay,
            hourly_pattern: hourlyPattern,
          },
          rag_quality: {
            response_time_trend: responseTimeTrend,
            token_usage: tokenUsage,
            system_health: systemHealth,
            avg_docs_per_query: avgDocsPerQuery,
          },
          metadata: {
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error("[Metrics Router] Error fetching metrics:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to load metrics. Please try again later.",
          cause: error,
        });
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
            meanSessionLength(10, params),
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
        console.error("[Metrics Router] Error fetching stats:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to calculate aggregated statistics",
          cause: error,
        });
      }
    }),

  exportMetrics: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        const params = buildQueryParams(input);

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
          topKSearchTerms(100, params),
          topKTopics(100, params),
          meanSessionLength(10, params),
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

        // Build comprehensive export data with sections
        const exportData = {
          // Summary metrics
          summary: {
            unique_users: uniqueUsersCount,
            total_events: totalEvents,
            avg_session_length_seconds: sessionLength ?? 0,
            avg_llm_response_time_ms: meanResponseTime ?? 0,
            avg_docs_per_query: avgDocsPerQuery,
          },

          // Token usage
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

          // System health
          system_health: {
            avg_cpu_percent: systemHealth.avg_cpu,
            max_cpu_percent: systemHealth.max_cpu,
            avg_ram_percent: systemHealth.avg_ram,
            max_ram_percent: systemHealth.max_ram,
            avg_gpu_percent: systemHealth.avg_gpu,
            max_gpu_percent: systemHealth.max_gpu,
          },

          // Role distribution
          role_distribution: roleDistribution,

          // Activity by day
          activity_by_day: activityByDay,

          // Hourly pattern
          hourly_pattern: hourlyPattern,

          // Response time trends
          response_time_trend: responseTimeTrend,

          // Search terms
          search_terms: searchTerms,

          // Topics
          topics: topics,
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
        console.error("[Metrics Router] Error exporting metrics:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to export metrics data",
          cause: error,
        });
      }
    }),
});
