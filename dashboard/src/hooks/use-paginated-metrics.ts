"use client";

import { api } from "@/trpc/react";
import { useState } from "react";
import { type DateRange } from "react-day-picker";

interface UsePaginatedMetricsOptions {
  dateRange?: DateRange;
  pageSize?: number;
  enabled?: boolean;
}

/**
 * Custom hook for paginated metrics queries
 *
 * Implements pagination support for large datasets
 * Allows fetching metrics in chunks to improve performance
 * Requirement 3.4: Removed nodeId parameter - single-node architecture
 */
export function usePaginatedMetrics({
  dateRange,
  pageSize = 100,
  enabled = true,
}: UsePaginatedMetricsOptions) {
  const [page, setPage] = useState(0);

  const query = api.metrics.get.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
      limit: pageSize,
      skip: page * pageSize,
    },
    {
      enabled,
      staleTime: 30_000, // 30 seconds
      refetchInterval: 60_000, // 1 minute auto-refresh
    },
  );

  const nextPage = () => setPage((p) => p + 1);
  const prevPage = () => setPage((p) => Math.max(0, p - 1));
  const resetPage = () => setPage(0);

  return {
    ...query,
    page,
    pageSize,
    nextPage,
    prevPage,
    resetPage,
    // Note: totalRecords not yet available from metrics_service
    hasNextPage: false,
    hasPrevPage: page > 0,
  };
}
