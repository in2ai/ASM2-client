import { API_RESOURCE, BACKEND_URL } from '@/lib/api'
import { useLogto } from '@logto/react'
import { useQuery } from '@tanstack/react-query'
import type { IndexingProgress } from './types'

export const RUNNING_POLL_INTERVAL_MS = 5_000
export const IDLE_POLL_INTERVAL_MS = 30_000

export const indexingProgressQueryKeys = {
  progress: ['indexing-progress', 'current'] as const,
}

function useAuthorizedIndexingProgressRequest() {
  const { getAccessToken } = useLogto()

  return async function authorizedIndexingProgressRequest<T>(path: string) {
    const token = await getAccessToken(API_RESOURCE)
    if (!token) {
      throw new Error('Missing access token')
    }

    const response = await fetch(`${BACKEND_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        detail?: string
      } | null
      throw new Error(payload?.detail ?? `Request failed (${response.status})`)
    }

    return (await response.json()) as T
  }
}

export function useIndexingProgressQuery(enabled: boolean) {
  const request = useAuthorizedIndexingProgressRequest()

  return useQuery({
    enabled,
    queryKey: indexingProgressQueryKeys.progress,
    queryFn: () => request<IndexingProgress>('/indexing/progress'),
    refetchInterval: (query) =>
      query.state.data?.status === 'running'
        ? RUNNING_POLL_INTERVAL_MS
        : IDLE_POLL_INTERVAL_MS,
  })
}
