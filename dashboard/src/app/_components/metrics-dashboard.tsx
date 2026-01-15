"use client";

import { NoMetricsEmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { api } from "@/trpc/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { AppLayout } from "./app-layout";
import { InsightsView } from "./metrics/insights-view";
import { LoadingState } from "./metrics/loading-state";
import { OverviewHighlights } from "./metrics/overview-highlights";
import { PersistentHeader } from "./metrics/persistent-header";
import { RAGQualityMetrics } from "./metrics/rag-quality-metrics";
import { type WorkOSUser } from "./metrics/types";
import { UsageMetrics } from "./metrics/usage-metrics";
import {
  getDateFormatter,
  getErrorMessage,
  getErrorTitle,
  isEmptyData,
  isRecoverableError,
} from "./metrics/utils";

/**
 * Display the metrics dashboard UI with date-range controls, header, and view-specific metric panels.
 *
 * Manages date-range state, fetches metrics and stats for the authenticated user, and shows loading, authentication, error, or empty states as appropriate. When data is available it renders the selected view's metrics panel (overview, usage, rag-quality, or insights).
 *
 * @returns The rendered dashboard element containing the header, controls, and the current metrics view or state screen.
 */
export function MetricsDashboard() {
  const { user: authUser } = useAuth();
  const user = authUser as WorkOSUser | null;

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const metricsQuery = api.metrics.get.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled: !!user,
    },
  );

  const { data, error, isError, isPending, isFetching, isRefetching } =
    metricsQuery;
  const refetch = metricsQuery.refetch as () => Promise<unknown>;

  const { data: stats } = api.metrics.getStats.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled: !!user,
    },
  );

  const lastUpdated = useMemo(
    () =>
      data
        ? getDateFormatter().format(new Date(data.metadata.updatedAt))
        : undefined,
    [data],
  );

  return (
    <AppLayout>
      {(view) => (
        <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
          {user && !isPending && (
            <PersistentHeader
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              lastUpdated={lastUpdated}
              stats={stats}
              isFetching={isFetching}
              onRefresh={() => {
                void refetch();
              }}
            />
          )}

          {isPending ? (
            <LoadingState />
          ) : !user ? (
            <ErrorState
              title="Authentication Required"
              message="Por favor, inicia sesión para ver las métricas."
              onRetry={() => {
                globalThis.location.reload();
              }}
              isRetrying={false}
              showHomeButton={true}
            />
          ) : isError ? (
            <ErrorState
              title={getErrorTitle(error)}
              message={getErrorMessage(error)}
              onRetry={
                isRecoverableError(error)
                  ? () => {
                      void refetch();
                    }
                  : undefined
              }
              isRetrying={isRefetching}
              showHomeButton={true}
            />
          ) : !data || isEmptyData(data) ? (
            <NoMetricsEmptyState
              onRefresh={() => {
                void refetch();
              }}
              isRefreshing={isRefetching}
            />
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500">
              {view === "overview" && <OverviewHighlights metrics={data} />}
              {view === "usage" && <UsageMetrics metrics={data} />}
              {view === "rag-quality" && <RAGQualityMetrics metrics={data} />}
              {view === "insights" && <InsightsView metrics={data} />}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}