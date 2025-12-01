import {
  createMetricsApiClient,
  type MetricsApiParams,
  type SearchTerm,
} from "@/lib/metrics-api";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Zod input schema for metrics queries (nodeId removed per Requirement 3.4)
const metricsQuerySchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
  skip: z.number().min(0).default(0),
});

/**
 * Dashboard metrics data structure matching the UI requirements
 * Maps data from metrics_service to the expected UI format
 * Note: Some fields are stubbed with default values until additional metrics_service endpoints are available
 */
interface DashboardMetrics {
  usage_metrics: {
    processed_queries: { total: number; daily_average: number };
    session_duration: { average_minutes: number };
    active_sessions: { daily: number; weekly: number; monthly: number };
    unique_users: { daily: number; weekly: number; monthly: number };
    department_distribution: Record<string, number>;
  };
  rag_quality_metrics: {
    successful_retrieval_rate: number;
    retrieval_latency_ms: number;
    average_context_tokens: number;
  };
  performance_metrics: {
    average_response_time_ms: number;
    token_usage: {
      average_prompt: number;
      average_completion: number;
      average_total: number;
    };
    resource_consumption: {
      cpu_percent: number;
      memory_mb: number;
    };
    cost_per_query: number;
    errors: Record<string, number>;
  };
  extra_analytics: {
    top_queries: string[];
    common_words: string[];
  };
  alerts: {
    status: string;
    latency_alert: number;
    error_rate_alert: number;
  };
  metadata: {
    updatedAt: string;
  };
}

/**
 * Builds API parameters from user context and input
 */
function buildApiParams(
  userContext: { userId: string; role: string },
  input: { startDate?: Date; endDate?: Date },
): MetricsApiParams {
  return {
    userId: userContext.userId,
    userRole: userContext.role,
    startDate: input.startDate?.toISOString().split("T")[0],
    endDate: input.endDate?.toISOString().split("T")[0],
  };
}

export const metricsRouter = createTRPCRouter({
  /**
   * Get metrics from metrics_service API
   * Transforms response to match expected UI data structures
   * Requirements: 1.1, 1.2, 7.1
   */
  get: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }): Promise<DashboardMetrics> => {
      try {
        const metricsApi = createMetricsApiClient();
        const params = buildApiParams(ctx.userContext, input);

        // Fetch data from metrics_service endpoints in parallel
        const [meanResponseTime, topSearchTerms, meanSessionLength] =
          await Promise.all([
            metricsApi.getMeanMetric({ metric: "response_time", ...params }),
            metricsApi.getTopSearchTerms({ k: 10, ...params }),
            metricsApi.getMeanSessionLength(params),
          ]);

        // Transform to UI data structure (Requirement 1.2)
        // Note: Fields marked with TODO are stubbed until additional metrics_service endpoints are available
        return {
          usage_metrics: {
            processed_queries: {
              total: 0, // TODO: Add endpoint to metrics_service
              daily_average: 0, // TODO: Add endpoint to metrics_service
            },
            session_duration: {
              average_minutes: meanSessionLength.result, // Requirement 6.3
            },
            active_sessions: {
              daily: 0, // TODO: Add endpoint to metrics_service
              weekly: 0,
              monthly: 0,
            },
            unique_users: {
              daily: 0, // TODO: Add endpoint to metrics_service
              weekly: 0,
              monthly: 0,
            },
            department_distribution: {}, // TODO: Add endpoint to metrics_service
          },
          rag_quality_metrics: {
            successful_retrieval_rate: 0, // TODO: Add endpoint to metrics_service
            retrieval_latency_ms: 0,
            average_context_tokens: 0,
          },
          performance_metrics: {
            average_response_time_ms: meanResponseTime.result, // Requirement 6.1
            token_usage: {
              average_prompt: 0, // TODO: Add endpoint to metrics_service
              average_completion: 0,
              average_total: 0,
            },
            resource_consumption: {
              cpu_percent: 0, // TODO: Add endpoint to metrics_service
              memory_mb: 0,
            },
            cost_per_query: 0, // TODO: Add endpoint to metrics_service
            errors: {}, // TODO: Add endpoint to metrics_service
          },
          extra_analytics: {
            top_queries: [], // TODO: Add endpoint to metrics_service
            common_words: topSearchTerms.result.map((term: SearchTerm) => term.word), // Requirement 6.2
          },
          alerts: {
            status: "healthy", // TODO: Add endpoint to metrics_service
            latency_alert: 5000,
            error_rate_alert: 5,
          },
          metadata: {
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        // Requirement 1.3: Display appropriate error message when service unavailable
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to load metrics. Please try again later.",
          cause: error,
        });
      }
    }),

  /**
   * Get aggregated statistics from metrics_service
   * Requirements: 7.2
   */
  getStats: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        const metricsApi = createMetricsApiClient();
        const params = buildApiParams(ctx.userContext, input);

        // Fetch aggregated stats from metrics_service
        const [meanResponseTime, meanSessionLength] = await Promise.all([
          metricsApi.getMeanMetric({ metric: "response_time", ...params }),
          metricsApi.getMeanSessionLength(params),
        ]);

        return {
          documentCount: 0, // TODO: Add endpoint to metrics_service to get actual count
          avgResponseTime: meanResponseTime.result,
          avgSessionLength: meanSessionLength.result,
          totalQueries: 0, // TODO: Add endpoint to metrics_service
          avgDailyUsers: 0,
          avgWeeklyUsers: 0,
          avgMonthlyUsers: 0,
        };
      } catch (error) {
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

  /**
   * Export metrics data from metrics_service
   * Requirements: 7.3
   */
  exportMetrics: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        const metricsApi = createMetricsApiClient();
        const params = buildApiParams(ctx.userContext, input);

        // Fetch data for export
        const [meanResponseTime, topSearchTerms, meanSessionLength] =
          await Promise.all([
            metricsApi.getMeanMetric({ metric: "response_time", ...params }),
            metricsApi.getTopSearchTerms({ k: 100, ...params }),
            metricsApi.getMeanSessionLength(params),
          ]);

        // Format data for CSV export
        const metrics = [
          {
            metric_type: "response_time",
            value: meanResponseTime.result,
            unit: "ms",
          },
          {
            metric_type: "session_length",
            value: meanSessionLength.result,
            unit: "minutes",
          },
          ...topSearchTerms.result.map((term: SearchTerm) => ({
            metric_type: "search_term",
            value: term.count,
            unit: term.word,
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
