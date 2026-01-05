import { Metrics } from "@/lib/metrics-constants";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  countMetrics,
  getActivityByDay,
  getDetailedStatusCodes,
  getErrorRate,
  getErrorRateByEndpoint,
  getHourlyActivityPattern,
  getLatencyByEndpoint,
  getLatencyDistribution,
  getMetricsByTag,
  getRequestsByDay,
  getRequestStats,
  getTotalActivityEvents,
  getUniqueUsers,
  getUserRoleDistribution,
  meanMetric,
  meanSessionLength,
  topKSearchTerms,
  topKTopics,
  type ActivityByDay,
  type EndpointErrorRate,
  type EndpointLatency,
  type HourlyActivity,
  type LatencyDistribution,
  type MetricsByTag,
  type MetricsQueryParams,
  type RequestsByDay,
  type RequestStats,
  type SearchTerm,
  type StatusCodeDetail,
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
 * Maps directly to the 5 tables: metrics, word_counts, topic_counts, user_activity, requests
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

  request_stats: RequestStats & {
    by_day: RequestsByDay[];
    latency_distribution: LatencyDistribution[];
    latency_by_endpoint: EndpointLatency[];
    error_by_endpoint: EndpointErrorRate[];
    detailed_status_codes: StatusCodeDetail[];
  };

  error_rate: number;

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
 * Builds query parameters from input (date range only, no user filtering)
 */
function buildQueryParams(input: {
  startDate?: Date;
  endDate?: Date;
}): MetricsQueryParams {
  return {
    startDate: formatDateForQuery(input.startDate),
    endDate: formatDateForQuery(input.endDate),
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
          requestStats,
          requestsByDay,
          latencyDistribution,
          latencyByEndpoint,
          errorByEndpoint,
          detailedStatusCodes,
          errorRate,
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
          getRequestStats(params),
          getRequestsByDay(params),
          getLatencyDistribution(params),
          getLatencyByEndpoint(params),
          getErrorRateByEndpoint(params),
          getDetailedStatusCodes(params),
          getErrorRate(params),
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
          request_stats: {
            ...requestStats,
            by_day: requestsByDay,
            latency_distribution: latencyDistribution,
            latency_by_endpoint: latencyByEndpoint,
            error_by_endpoint: errorByEndpoint,
            detailed_status_codes: detailedStatusCodes,
          },
          error_rate: errorRate,
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

        const [
          meanResponseTime,
          sessionLength,
          uniqueUsersCount,
          totalEvents,
          requestStats,
        ] = await Promise.all([
          meanMetric(Metrics.LLM_RESPONSE_TIME, params),
          meanSessionLength(10, params),
          getUniqueUsers(params),
          getTotalActivityEvents(params),
          getRequestStats(params),
        ]);

        return {
          totalMetricsRecords: totalEvents,
          avgResponseTime: meanResponseTime ?? 0,
          avgSessionLength: sessionLength ?? 0,
          totalRequests: requestStats.total_requests,
          avgLatency: requestStats.avg_latency ?? 0,
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
          requestStats,
          errorRate,
        ] = await Promise.all([
          meanMetric(Metrics.LLM_RESPONSE_TIME, params),
          topKSearchTerms(100, params),
          topKTopics(100, params),
          meanSessionLength(10, params),
          getUniqueUsers(params),
          getRequestStats(params),
          getErrorRate(params),
        ]);

        const metrics = [
          {
            metric_type: Metrics.LLM_RESPONSE_TIME,
            value: meanResponseTime ?? 0,
            unit: "ms",
          },
          {
            metric_type: "session_length",
            value: sessionLength ?? 0,
            unit: "seconds",
          },
          {
            metric_type: "unique_users",
            value: uniqueUsersCount,
            unit: "count",
          },
          {
            metric_type: "total_requests",
            value: requestStats.total_requests,
            unit: "count",
          },
          {
            metric_type: "avg_latency",
            value: requestStats.avg_latency ?? 0,
            unit: "ms",
          },
          {
            metric_type: "error_rate",
            value: errorRate,
            unit: "percent",
          },
          ...searchTerms.map((term: SearchTerm) => ({
            metric_type: "search_term",
            value: term.count,
            unit: term.word,
          })),
          ...topics.map((topic: TopicCount) => ({
            metric_type: "topic",
            value: topic.count,
            unit: topic.topic,
          })),
        ];

        return {
          metrics,
          metadata: {
            startDate: input.startDate?.toISOString(),
            endDate: input.endDate?.toISOString(),
            exportTimestamp: new Date().toISOString(),
            totalRecords: metrics.length,
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
