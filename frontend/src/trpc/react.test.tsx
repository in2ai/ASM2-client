// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { api, type DashboardMetrics } from './react'

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}))

vi.mock('@logto/react', () => ({
  useLogto: () => ({
    getAccessToken: mocks.getAccessToken,
  }),
}))

const dashboardMetrics: DashboardMetrics = {
  metadata: {
    updatedAt: '2026-06-03T12:00:00.000Z',
  },
  metrics: {
    by_tag: [],
    response_time: 0.2,
    total_count: 12,
  },
  rag_quality: {
    avg_docs_per_query: 2.5,
    response_time_trend: [],
    system_health: {
      avg_cpu: 10,
      avg_gpu: 20,
      avg_ram: 30,
      max_cpu: 40,
      max_gpu: 50,
      max_ram: 60,
    },
    token_usage: {
      llm_tokens_in: 100,
      llm_tokens_out: 50,
      rag_tokens_in: 20,
      rag_tokens_out: 10,
    },
  },
  top_topics: [],
  top_words: [],
  user_activity: {
    by_day: [],
    hourly_pattern: [],
    mean_session_length_seconds: 30,
    role_distribution: { user: 2 },
    total_events: 12,
    unique_users: 2,
  },
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('metrics API hooks', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue('metrics-token')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('serializes filters and sends authenticated dashboard metric requests', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(dashboardMetrics))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(
      () =>
        api.metrics.get.useQuery({
          endDate: new Date(2026, 5, 3),
          lang: 'en',
          startDate: new Date(2026, 4, 28),
          userId: ' user-1 ',
          userRole: ' admin ',
        }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const url = new URL(requestUrl)

    expect(url.pathname).toBe('/metrics/dashboard')
    expect(url.searchParams.get('startDate')).toBe('2026-05-28')
    expect(url.searchParams.get('endDate')).toBe('2026-06-03')
    expect(url.searchParams.get('userId')).toBe('user-1')
    expect(url.searchParams.get('userRole')).toBe('admin')
    expect(url.searchParams.get('lang')).toBe('en')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer metrics-token',
    )
  })

  it('surfaces missing-token errors before fetching metrics', async () => {
    const fetchMock = vi.fn()
    mocks.getAccessToken.mockResolvedValue(null)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => api.metrics.getStats.useQuery({}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe(
      'UNAUTHORIZED: missing access token',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
