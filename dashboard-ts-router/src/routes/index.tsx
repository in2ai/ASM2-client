import { Suspense, lazy } from 'react'

import { Navigate, createFileRoute } from '@tanstack/react-router'

import { LoadingState } from '@/app/_components/metrics/loading-state'
import { useAuthenticatedUser } from '@/hooks/use-authenticated-user'

const MetricsDashboard = lazy(() =>
  import('@/app/_components/metrics-dashboard').then((module) => ({
    default: module.MetricsDashboard,
  })),
)

export const Route = createFileRoute('/')({ component: DashboardRoute })

function DashboardRoute() {
  const { isLoading, isAuthenticated, user } = useAuthenticatedUser()

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

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
          <LoadingState />
        </div>
      }
    >
      <MetricsDashboard user={user} />
    </Suspense>
  )
}
