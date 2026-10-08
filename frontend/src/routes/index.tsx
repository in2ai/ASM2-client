import { RouteError } from '@/components/route-error'
import { type DashboardView } from '@/app/_components/dashboard-views'
import { LoadingState } from '@/app/_components/metrics/loading-state'
import { useAuthenticatedUser } from '@/hooks/use-authenticated-user'
import { hasDashboardAccess } from '@/lib/auth'
import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense, lazy, useCallback } from 'react'
import type { DateRange } from 'react-day-picker'
import { dashboardSearchSchema } from '@/lib/dashboard-search'

const MetricsDashboard = lazy(() =>
  import('@/app/_components/metrics-dashboard').then((module) => ({
    default: module.MetricsDashboard,
  })),
)

/**
 * The dashboard's view and date range live in the URL.
 *
 * They are what someone means when they say "look at this": kept in component
 * state they survived neither a reload nor the back button, and there was no
 * way to send a colleague the thing you were looking at.
 */
export const Route = createFileRoute('/')({
  validateSearch: dashboardSearchSchema,
  component: DashboardRoute,
  errorComponent: RouteError,
})

/** A `yyyy-MM-dd` pair as the local calendar days the reader picked. */
function toDateRange(from?: string, to?: string): DateRange | undefined {
  if (!from || !to) {
    return undefined
  }

  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)

  return {
    from: new Date(fromYear, fromMonth - 1, fromDay, 0, 0, 0, 0),
    to: new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999),
  }
}

function toSearchDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function DashboardRoute() {
  const navigate = useNavigate({ from: '/' })
  const search = Route.useSearch()
  const { isLoading, isAuthenticated, user } = useAuthenticatedUser()

  const handleViewChange = useCallback(
    (view: DashboardView) => {
      // Replace, not push: flipping between views is browsing one page, and
      // a history entry per tab would bury wherever the reader came from.
      void navigate({
        replace: true,
        search: (current) => ({ ...current, view }),
      })
    },
    [navigate],
  )

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      void navigate({
        search: (current) => ({
          ...current,
          from: range?.from ? toSearchDate(range.from) : undefined,
          to: range?.to ? toSearchDate(range.to) : undefined,
        }),
      })
    },
    [navigate],
  )

  if ((isLoading && !user) || (isAuthenticated && !user)) {
    return (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        <LoadingState />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/sign-in" search={{ returnTo: '/' }} replace />
  }

  if (!hasDashboardAccess(user)) {
    return <Navigate to="/chat" replace />
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
          <LoadingState />
        </div>
      }
    >
      <MetricsDashboard
        dateRange={toDateRange(search.from, search.to)}
        onDateRangeChange={handleDateRangeChange}
        onViewChange={handleViewChange}
        user={user}
        view={search.view ?? 'overview'}
      />
    </Suspense>
  )
}
