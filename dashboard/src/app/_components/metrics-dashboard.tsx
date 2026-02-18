"use client";

import { type DashboardView } from "@/app/_components/dashboard-views";
import { NoMetricsEmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { type LogtoUser } from "@/lib/auth";
import { api } from "@/trpc/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { AppLayout } from "./app-layout";
import { InsightsView } from "./metrics/insights-view";
import { LoadingState } from "./metrics/loading-state";
import { OverviewHighlights } from "./metrics/overview-highlights";
import { PersistentHeader } from "./metrics/persistent-header";
import { RAGQualityMetrics } from "./metrics/rag-quality-metrics";
import { type MetricsResponse } from "./metrics/types";
import { UsageMetrics } from "./metrics/usage-metrics";
import {
  getDateFormatter,
  getMetricsErrorCode,
  isEmptyData,
  isRecoverableError,
} from "./metrics/utils";

interface MetricsDashboardProps {
  readonly user: LogtoUser;
}

const QUERY_OPTIONS = {
  refetchInterval: 60_000,
  staleTime: 30_000,
} as const;

function renderMetricsView(
  view: DashboardView,
  userMetrics: MetricsResponse | undefined,
) {
  if (!userMetrics) {
    return null;
  }

  switch (view) {
    case "overview":
      return <OverviewHighlights metrics={userMetrics} />;
    case "usage":
      return <UsageMetrics metrics={userMetrics} />;
    case "rag-quality":
      return <RAGQualityMetrics metrics={userMetrics} />;
    case "insights":
      return <InsightsView metrics={userMetrics} />;
    default:
      return null;
  }
}

export function MetricsDashboard({ user }: MetricsDashboardProps) {
  const locale = useLocale();
  const t = useTranslations("MetricsErrors");

  const [currentView, setCurrentView] = useState<DashboardView>("overview");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const metricsInput = useMemo(
    () => ({
      startDate: dateRange?.from,
      endDate: dateRange?.to,
      lang: locale,
    }),
    [dateRange?.from, dateRange?.to, locale],
  );

  const metricsQuery = api.metrics.get.useQuery(metricsInput, QUERY_OPTIONS);
  const statsQuery = api.metrics.getStats.useQuery(metricsInput, QUERY_OPTIONS);

  const { data, error, isError, isPending, isFetching, isRefetching } =
    metricsQuery;
  const { data: stats } = statsQuery;

  const handleRefresh = useCallback(() => {
    void metricsQuery.refetch();
  }, [metricsQuery]);

  const handleRetry = useCallback(() => {
    void metricsQuery.refetch();
  }, [metricsQuery]);

  const lastUpdated = useMemo(() => {
    if (!data) {
      return undefined;
    }

    return getDateFormatter(locale).format(new Date(data.metadata.updatedAt));
  }, [data, locale]);

  const errorCode = getMetricsErrorCode(error);
  const errorTitles = {
    unauthorized: t("titles.unauthorized"),
    forbidden: t("titles.forbidden"),
    notFound: t("titles.notFound"),
    timeout: t("titles.timeout"),
    network: t("titles.network"),
    server: t("titles.server"),
    unknown: t("titles.unknown"),
  } as const;
  const errorMessages = {
    unauthorized: t("messages.unauthorized"),
    forbidden: t("messages.forbidden"),
    notFound: t("messages.notFound"),
    timeout: t("messages.timeout"),
    network: t("messages.network"),
    server: t("messages.server"),
    unknown: t("messages.unknown"),
  } as const;

  return (
    <AppLayout user={user} view={currentView} onViewChange={setCurrentView}>
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        {!isPending && (
          <PersistentHeader
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            lastUpdated={lastUpdated}
            stats={stats}
            isFetching={isFetching}
            onRefresh={handleRefresh}
          />
        )}

        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState
            title={errorTitles[errorCode]}
            message={errorMessages[errorCode]}
            onRetry={isRecoverableError(error) ? handleRetry : undefined}
            isRetrying={isRefetching}
            showHomeButton={true}
          />
        ) : !data || isEmptyData(data) ? (
          <NoMetricsEmptyState
            onRefresh={handleRefresh}
            isRefreshing={isRefetching}
          />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500">
            {renderMetricsView(currentView, data)}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
