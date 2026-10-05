import { AppLayout } from '@/app/_components/app-layout'
import { type DashboardView } from '@/app/_components/dashboard-views'
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
import { api } from '@/lib/metrics-api'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense, lazy, useCallback, useMemo } from 'react'
import { type DateRange } from 'react-day-picker'

interface MetricsDashboardProps {
  /** Both of these live in the URL; see `src/routes/index.tsx`. */
  readonly dateRange: DateRange | undefined
  readonly onDateRangeChange: (range: DateRange | undefined) => void
  readonly onViewChange: (view: DashboardView) => void
  readonly user: LogtoUser
  readonly view: DashboardView
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
  dateRange: DateRange | undefined,
) {
  if (!userMetrics) {
    return null
  }

  return (
    <Suspense fallback={<LoadingState />}>
      {view === 'overview' && <OverviewHighlights metrics={userMetrics} />}
      {view === 'usage' && <UsageMetrics metrics={userMetrics} />}
      {view === 'rag-quality' && <RAGQualityMetrics metrics={userMetrics} />}
      {view === 'insights' && <InsightsView dateRange={dateRange} />}
    </Suspense>
  )
}

function renderDashboardContent({
  data,
  dateRange,
  errorCode,
  errorMessages,
  errorTitles,
  handleRefresh,
  handleRetry,
  isError,
  isPending,
  isRefetching,
  currentView,
}: {
  data: MetricsResponse | undefined
  dateRange: DateRange | undefined
  errorCode: keyof typeof errorTitles
  errorMessages: Record<keyof typeof errorTitles, string>
  errorTitles: Record<string, string>
  handleRefresh: () => Promise<void>
  handleRetry: () => Promise<void>
  isError: boolean
  isPending: boolean
  isRefetching: boolean
  currentView: DashboardView
}) {
  if (isPending) {
    return <LoadingState />
  }

  if (isError) {
    return (
      <ErrorState
        title={errorTitles[errorCode]}
        message={errorMessages[errorCode]}
        onRetry={handleRetry}
        isRetrying={isRefetching}
        showHomeButton={true}
      />
    )
  }

  if (!data || isEmptyData(data)) {
    return (
      <NoMetricsEmptyState
        onRefresh={handleRefresh}
        isRefreshing={isRefetching}
      />
    )
  }

  // The data on screen stays put while the next minute's numbers are fetched.
  // Dimming it behind an overlay, as this used to, hid readable figures every
  // sixty seconds to announce something the header already shows.
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500">
      {renderMetricsView(currentView, data, dateRange)}
    </div>
  )
}

export function MetricsDashboard({
  dateRange,
  onDateRangeChange,
  onViewChange,
  user,
  view: currentView,
}: MetricsDashboardProps) {
  const locale = useLocale()
  const t = useTranslations('MetricsErrors')

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      // A half-picked range is not a range yet: the calendar reports the first
      // click too, and querying on it would show a single day at random.
      onDateRangeChange(range?.from && range.to ? range : undefined)
    },
    [onDateRangeChange],
  )

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
    <AppLayout user={user} view={currentView} onViewChange={onViewChange}>
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

        {renderDashboardContent({
          data,
          dateRange,
          errorCode,
          errorMessages,
          errorTitles,
          handleRefresh,
          handleRetry: isRecoverableError(error) ? handleRetry : handleRefresh,
          isError,
          isPending,
          isRefetching,
          currentView,
        })}
      </div>
    </AppLayout>
  )
}
