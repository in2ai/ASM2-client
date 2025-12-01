import { env } from "@/env";
import { TRPCError } from "@trpc/server";

/**
 * Parameters for metrics API calls
 */
export interface MetricsApiParams {
  userId?: string;
  userRole?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Response type for mean metric endpoint
 */
interface MeanMetricResponse {
  result: number;
}

/**
 * Search term with count
 */
export interface SearchTerm {
  word: string;
  count: number;
}

/**
 * Response type for top search terms endpoint
 */
interface TopSearchTermsResponse {
  result: SearchTerm[];
}

/**
 * Response type for mean session length endpoint
 */
interface MeanSessionLengthResponse {
  result: number;
}

/**
 * Metrics API client interface
 */
interface MetricsApiClient {
  getMeanMetric(
    params: MetricsApiParams & { metric: string },
  ): Promise<MeanMetricResponse>;

  getTopSearchTerms(
    params: MetricsApiParams & { k?: number },
  ): Promise<TopSearchTermsResponse>;

  getMeanSessionLength(
    params: MetricsApiParams,
  ): Promise<MeanSessionLengthResponse>;
}


/**
 * Fetches data from the metrics service
 */
async function fetchFromMetricsService<T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  try {
    const url = new URL(endpoint, env.METRICS_SERVICE_URL);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Metrics service error: ${response.status}`,
      });
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to connect to metrics service",
      cause: error,
    });
  }
}

/**
 * Creates a metrics API client instance
 */
export function createMetricsApiClient(): MetricsApiClient {
  return {
    async getMeanMetric(
      params: MetricsApiParams & { metric: string },
    ): Promise<MeanMetricResponse> {
      const { metric, userId, userRole, startDate, endDate } = params;
      return fetchFromMetricsService<MeanMetricResponse>("/mean_metric", {
        metric,
        user_id: userId,
        user_role: userRole,
        start_date: startDate,
        end_date: endDate,
      });
    },

    async getTopSearchTerms(
      params: MetricsApiParams & { k?: number },
    ): Promise<TopSearchTermsResponse> {
      const { k, userId, userRole, startDate, endDate } = params;
      return fetchFromMetricsService<TopSearchTermsResponse>(
        "/top_search_terms",
        {
          k,
          user_id: userId,
          user_role: userRole,
          start_date: startDate,
          end_date: endDate,
        },
      );
    },

    async getMeanSessionLength(
      params: MetricsApiParams,
    ): Promise<MeanSessionLengthResponse> {
      const { userId, userRole, startDate, endDate } = params;
      return fetchFromMetricsService<MeanSessionLengthResponse>(
        "/mean_session_length",
        {
          user_id: userId,
          user_role: userRole,
          start_date: startDate,
          end_date: endDate,
        },
      );
    },
  };
}
