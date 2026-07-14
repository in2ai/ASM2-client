import { API_RESOURCE, BACKEND_URL } from '@/lib/api'
import { useLogto } from '@logto/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  DeletionGuardConfig,
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
      throw new Error('Missing access token')
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
      throw new Error(payload?.detail ?? `Request failed (${response.status})`)
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

export function useIndexingAlertsQuery(enabled: boolean) {
  const request = useAuthorizedIndexingRequest()

  return useQuery({
    enabled,
    queryKey: indexingAlertQueryKeys.alerts,
    queryFn: () =>
      request<IndexingDeletionAlert[]>('/indexing/alerts?limit=50'),
    refetchInterval: enabled ? 15_000 : false,
    refetchIntervalInBackground: true,
  })
}

export function useDeleteIndexingAlertMutation() {
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

export function useClearIndexingAlertsMutation() {
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
