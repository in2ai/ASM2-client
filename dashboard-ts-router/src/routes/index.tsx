import { Suspense, lazy, useEffect, useState } from 'react'

import { useLogto } from '@logto/react'
import { Navigate, createFileRoute } from '@tanstack/react-router'

import { LoadingState } from '@/app/_components/metrics/loading-state'
import { type LogtoUser, mapClaimsToUser } from '@/lib/auth'

const MetricsDashboard = lazy(() =>
  import('@/app/_components/metrics-dashboard').then((module) => ({
    default: module.MetricsDashboard,
  })),
)

export const Route = createFileRoute('/')({ component: DashboardRoute })

function DashboardRoute() {
  const { isLoading, isAuthenticated, getIdTokenClaims } = useLogto()
  const [user, setUser] = useState<LogtoUser | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      if (!isAuthenticated) {
        setUser(null)
        return
      }

      const claims = await getIdTokenClaims()
      if (!claims || cancelled) {
        return
      }

      setUser(mapClaimsToUser(claims))
    }

    void loadUser()

    return () => {
      cancelled = true
    }
  }, [getIdTokenClaims, isAuthenticated])

  if (isLoading || (isAuthenticated && !user)) {
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
