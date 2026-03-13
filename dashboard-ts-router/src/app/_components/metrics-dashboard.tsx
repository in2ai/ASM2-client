import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { endOfDay, startOfDay } from 'date-fns'
import { type DateRange } from 'react-day-picker'
import { useLocale, useTranslations } from 'next-intl'

import { type DashboardView } from '@/app/_components/dashboard-views'
import { AppLayout } from '@/app/_components/app-layout'
import { LoadingState } from '@/app/_components/metrics/loading-state'
import { PersistentHeader } from '@/app/_components/metrics/persistent-header'
import { type MetricsResponse } from '@/app/_components/metrics/types'
import {
  getDateFormatter,
  getMetricsErrorCode,
  isEmptyData,
  isRecoverableError,
} from '@/app/_components/metrics/utils'
import { NoMetricsEmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { type LogtoUser } from '@/lib/auth'
import { api } from '@/trpc/react'

interface MetricsDashboardProps {
  readonly user: LogtoUser
}

const OverviewHighlights = lazy(() =>
  import('@/app/_components/metrics/overview-highlights').then((module) => ({
    default: module.OverviewHighlights,
  })),
)

const UsageMetrics = lazy(() =>
  import('@/app/_components/metrics/usage-metrics').then((module) => ({
    default: module.UsageMetrics,
  })),
)

const RAGQualityMetrics = lazy(() =>
  import('@/app/_components/metrics/rag-quality-metrics').then((module) => ({
    default: module.RAGQualityMetrics,
  })),
)

const InsightsView = lazy(() =>
  import('@/app/_components/metrics/insights-view').then((module) => ({
    default: module.InsightsView,
  })),
)

const QUERY_OPTIONS = {
  refetchInterval: 60_000,
  staleTime: 30_000,
} as const

function renderMetricsView(
  view: DashboardView,
  userMetrics: MetricsResponse | undefined,
) {
  if (!userMetrics) {
    return null
  }

  return (
    <Suspense fallback={<LoadingState />}>
      {view === 'overview' && <OverviewHighlights metrics={userMetrics} />}
      {view === 'usage' && <UsageMetrics metrics={userMetrics} />}
      {view === 'rag-quality' && <RAGQualityMetrics metrics={userMetrics} />}
      {view === 'insights' && <InsightsView metrics={userMetrics} />}
    </Suspense>
  )
}

export function MetricsDashboard({ user }: MetricsDashboardProps) {
  const locale = useLocale()
  const t = useTranslations('MetricsErrors')

  const [currentView, setCurrentView] = useState<DashboardView>('overview')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    if (!range?.from || !range.to) {
      setDateRange(undefined)
      return
    }

    setDateRange({
      from: startOfDay(new Date(range.from)),
      to: endOfDay(new Date(range.to)),
    })
  }, [])

  const metricsInput = useMemo(
    () => ({
      startDate: dateRange?.from,
      endDate: dateRange?.to,
      lang: locale,
    }),
    [dateRange?.from, dateRange?.to, locale],
  )

  const metricsQuery = api.metrics.get.useQuery(metricsInput, QUERY_OPTIONS)
  const statsQuery = api.metrics.getStats.useQuery(metricsInput, QUERY_OPTIONS)

  const { data, error, isError, isPending, isFetching, isRefetching } =
    metricsQuery
  const { data: stats } = statsQuery

  const handleRefresh = useCallback(async () => {
    await metricsQuery.refetch()
  }, [metricsQuery])

  const handleRetry = useCallback(async () => {
    await metricsQuery.refetch()
  }, [metricsQuery])

  const lastUpdated = useMemo(() => {
    if (!data) {
      return undefined
    }

    return getDateFormatter(locale).format(new Date(data.metadata.updatedAt))
  }, [data, locale])

  const errorCode = getMetricsErrorCode(error)
  const errorTitles = {
    unauthorized: t('titles.unauthorized'),
    forbidden: t('titles.forbidden'),
    notFound: t('titles.notFound'),
    timeout: t('titles.timeout'),
    network: t('titles.network'),
    server: t('titles.server'),
    unknown: t('titles.unknown'),
  } as const
  const errorMessages = {
    unauthorized: t('messages.unauthorized'),
    forbidden: t('messages.forbidden'),
    notFound: t('messages.notFound'),
    timeout: t('messages.timeout'),
    network: t('messages.network'),
    server: t('messages.server'),
    unknown: t('messages.unknown'),
  } as const

  return (
    <AppLayout user={user} view={currentView} onViewChange={setCurrentView}>
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        {!isPending && (
          <PersistentHeader
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
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
  )
}
