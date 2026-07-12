// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  useDeletionGuardQuery,
  useIndexingAlertsQuery,
  useUpdateDeletionGuardMutation,
} from './api'

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}))

vi.mock('@logto/react', () => ({
  useLogto: () => ({
    getAccessToken: mocks.getAccessToken,
  }),
}))

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  return {
    queryClient,
    Wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  }
}

describe('indexing alerts API', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockClear()
    mocks.getAccessToken.mockResolvedValue('indexing-token')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads the deletion guard and recent alerts through authenticated routes', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        if (requestUrl.endsWith('/indexing/deletion-guard')) {
          return jsonResponse({ threshold_percentage: null })
        }
        if (requestUrl.endsWith('/indexing/alerts?limit=50')) {
          return jsonResponse([])
        }
        throw new Error(`Unexpected request: ${requestUrl}`)
      },
    )
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()

    const { result } = renderHook(
      () => ({
        alerts: useIndexingAlertsQuery(true),
        config: useDeletionGuardQuery(true),
      }),
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.alerts.isSuccess).toBe(true)
      expect(result.current.config.isSuccess).toBe(true)
    })

    expect(result.current.config.data).toEqual({ threshold_percentage: null })
    expect(result.current.alerts.data).toEqual([])
    for (const [, init] of fetchMock.mock.calls) {
      const headers = init?.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer indexing-token')
    }

    queryClient.clear()
  })

  it('does not request tokens or data when alert access is disabled', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()

    const { result } = renderHook(
      () => ({
        alerts: useIndexingAlertsQuery(false),
        config: useDeletionGuardQuery(false),
      }),
      { wrapper: Wrapper },
    )

    expect(result.current.alerts.fetchStatus).toBe('idle')
    expect(result.current.config.fetchStatus).toBe('idle')
    expect(mocks.getAccessToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    queryClient.clear()
  })

  it('updates the deletion threshold with the backend contract', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ threshold_percentage: 42.5 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()
    const { result } = renderHook(() => useUpdateDeletionGuardMutation(), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({ threshold_percentage: 42.5 })
    })

    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(requestUrl).toMatch(/\/indexing\/deletion-guard$/)
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ threshold_percentage: 42.5 }))

    queryClient.clear()
  })
})
