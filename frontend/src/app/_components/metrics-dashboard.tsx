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
import { api } from '@/trpc/react'
import { endOfDay, startOfDay } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { type DateRange } from 'react-day-picker'

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
      {view === 'insights' && (
        <InsightsView metrics={userMetrics} dateRange={dateRange} />
      )}
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
  showUpdatingOverlay,
  currentView,
  headerT,
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
  showUpdatingOverlay: boolean
  currentView: DashboardView
  headerT: ReturnType<typeof useTranslations>
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

  return (
    <div className="relative">
      <div
        className={[
          'animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500 transition-opacity',
          showUpdatingOverlay ? 'opacity-45' : 'opacity-100',
        ].join(' ')}
      >
        {renderMetricsView(currentView, data, dateRange)}
      </div>

      {showUpdatingOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-3xl bg-background/35 px-4 pt-8 backdrop-blur-[2px] sm:pt-12"
          role="status"
          aria-live="polite"
        >
          <div className="bg-card/95 border-border/60 flex max-w-sm items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur-md">
            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="space-y-0.5">
              <p className="font-semibold tracking-tight">
                {headerT('updatingOverlayTitle')}
              </p>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {headerT('updatingOverlayDescription')}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function MetricsDashboard({ user }: MetricsDashboardProps) {
  const locale = useLocale()
  const t = useTranslations('MetricsErrors')
  const headerT = useTranslations('PersistentHeader')

  const [currentView, setCurrentView] = useState<DashboardView>('overview')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [showUpdatingOverlay, setShowUpdatingOverlay] = useState(false)

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

  useEffect(() => {
    if (!isFetching || isPending) {
      setShowUpdatingOverlay(false)
      return
    }

    const timer = globalThis.setTimeout(() => {
      setShowUpdatingOverlay(true)
    }, 180)

    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [isFetching, isPending])

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
          showUpdatingOverlay,
          currentView,
          headerT,
        })}
      </div>
    </AppLayout>
  )
}
