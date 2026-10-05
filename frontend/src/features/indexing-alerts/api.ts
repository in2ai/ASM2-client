import { ApiError } from '@/lib/api-error'
import { API_RESOURCE, BACKEND_URL } from '@/lib/api'
import { useLogto } from '@logto/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DeletionGuardConfig,
  DeletionGuardOverrideUpdate,
  DeletionGuardUpdate,
  IndexingDeletionAlert,
} from './types'

const indexingAlertQueryKeys = {
  alerts: ['indexing-alerts', 'list'] as const,
  deletionGuard: ['indexing-alerts', 'deletion-guard'] as const,
}

function useAuthorizedIndexingRequest() {
  const { getAccessToken } = useLogto()

  return async function authorizedIndexingRequest<T>(
    path: string,
    init?: RequestInit,
  ) {
    const token = await getAccessToken(API_RESOURCE)
    if (!token) {
      throw new ApiError(401, 'Missing access token')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (init?.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        detail?: string
      } | null
      throw new ApiError(
        response.status,
        payload?.detail ?? `Request failed (${response.status})`,
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    const responseText = await response.text()
    if (!responseText) {
      return undefined as T
    }

    return JSON.parse(responseText) as T
  }
}

export function useDeletionGuardQuery(enabled: boolean) {
  const request = useAuthorizedIndexingRequest()

  return useQuery({
    enabled,
    queryKey: indexingAlertQueryKeys.deletionGuard,
    queryFn: () => request<DeletionGuardConfig>('/indexing/deletion-guard'),
  })
}

export function useUpdateDeletionGuardMutation() {
  const request = useAuthorizedIndexingRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: DeletionGuardUpdate) =>
      request<DeletionGuardConfig>('/indexing/deletion-guard', {
        body: JSON.stringify(config),
        method: 'PUT',
      }),
    onSuccess: (config) => {
      queryClient.setQueryData(indexingAlertQueryKeys.deletionGuard, config)
    },
  })
}

export function useUpdateDeletionGuardOverrideMutation() {
  const request = useAuthorizedIndexingRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (override: DeletionGuardOverrideUpdate) =>
      request<DeletionGuardConfig>('/indexing/deletion-guard/override', {
        body: JSON.stringify(override),
        method: 'PUT',
      }),
    onSuccess: (config) => {
      queryClient.setQueryData(indexingAlertQueryKeys.deletionGuard, config)
    },
  })
}

/** How often alerts are asked for while someone is looking at the page. */
const VISIBLE_POLL_INTERVAL_MS = 15_000

/**
 * And while the tab is hidden.
 *
 * Alerts still have to arrive for a tab left open in another window, so the
 * polling does not stop -- but at fifteen seconds it was some five thousand
 * requests a day per open tab, nearly all of them into a page nobody could
 * see. Coming back to the tab refetches at once, so the slower beat costs
 * the reader no freshness.
 */
const HIDDEN_POLL_INTERVAL_MS = 120_000

export function useIndexingAlertsQuery(enabled: boolean) {
  const request = useAuthorizedIndexingRequest()

  return useQuery({
    enabled,
    queryKey: indexingAlertQueryKeys.alerts,
    queryFn: ({ signal }) =>
      request<IndexingDeletionAlert[]>('/indexing/alerts?limit=50', { signal }),
    refetchInterval: () =>
      document.visibilityState === 'hidden'
        ? HIDDEN_POLL_INTERVAL_MS
        : VISIBLE_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })
}

export function useDismissIndexingAlertMutation() {
  const request = useAuthorizedIndexingRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (alertId: number) =>
      request<void>(`/indexing/alerts/${alertId}`, { method: 'DELETE' }),
    onSuccess: (_, alertId) => {
      queryClient.setQueryData<IndexingDeletionAlert[]>(
        indexingAlertQueryKeys.alerts,
        (alerts) => alerts?.filter((alert) => alert.id !== alertId),
      )
    },
  })
}

export function useDismissAllIndexingAlertsMutation() {
  const request = useAuthorizedIndexingRequest()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => request<void>('/indexing/alerts', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData<IndexingDeletionAlert[]>(
        indexingAlertQueryKeys.alerts,
        [],
      )
    },
  })
}
