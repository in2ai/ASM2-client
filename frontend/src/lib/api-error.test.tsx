// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { useChatsQuery } from '@/features/chat/api'
import { useIndexingAlertsQuery } from '@/features/indexing-alerts/api'
import { useIndexingProgressQuery } from '@/features/indexing-progress/api'
import { api } from './metrics-api'
import { ApiError, shouldRetryQuery } from './api-error'

const auth = vi.hoisted(() => ({ getAccessToken: vi.fn() }))
vi.mock('@logto/react', () => ({ useLogto: () => auth }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each([
  ['chat', () => useChatsQuery()],
  ['indexing alerts', () => useIndexingAlertsQuery(true)],
  ['indexing progress', () => useIndexingProgressQuery(true)],
  ['metrics', () => api.metrics.get.useQuery({})],
] as const)('%s retry policy', (_name, useRequest) => {
  it.each([
    { status: 401, token: undefined, expectedRequests: 0 },
    { status: 403, token: 'token', expectedRequests: 1 },
    { status: 404, token: 'token', expectedRequests: 1 },
    { status: 503, token: 'token', expectedRequests: 3 },
  ])(
    'handles status $status without parsing the message',
    async ({ status, token, expectedRequests }) => {
      auth.getAccessToken.mockReset().mockResolvedValue(token)
      const fetch = vi.fn(async () =>
        Response.json({ detail: 'Request rejected' }, { status }),
      )
      vi.stubGlobal('fetch', fetch)
      const client = new QueryClient({
        defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
      const { result, unmount } = renderHook(() => useRequest(), { wrapper })
      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeInstanceOf(ApiError)
      expect(result.current.error).toHaveProperty('status', status)
      expect(fetch).toHaveBeenCalledTimes(expectedRequests)
      expect(auth.getAccessToken).toHaveBeenCalledTimes(
        Math.max(expectedRequests, 1),
      )
      unmount()
      client.clear()
    },
  )
})

it('retries network failures at most twice', () => {
  const error = new TypeError('Failed to fetch')
  expect(shouldRetryQuery(0, error)).toBe(true)
  expect(shouldRetryQuery(1, error)).toBe(true)
  expect(shouldRetryQuery(2, error)).toBe(false)
})
