// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { indexingProgressQueryKeys, useIndexingProgressQuery } from './api'
import { IndexingProgressIndicator } from './indexing-progress-indicator'
import type { IndexingProgress } from './types'

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}))

vi.mock('@logto/react', () => ({
  useLogto: () => ({
    getAccessToken: mocks.getAccessToken,
  }),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
}))

const idleProgress: IndexingProgress = {
  status: 'idle',
  phase: null,
  current_source: null,
  sources_total: 0,
  sources_completed: 0,
  files_total: 0,
  files_processed: 0,
  chunks_indexed: 0,
  eta_seconds: null,
  detail: null,
  started_at: null,
  updated_at: '2026-09-07T10:00:00Z',
  finished_at: null,
  indexing_enabled: false,
}

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

describe('indexing progress API', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockClear()
    mocks.getAccessToken.mockResolvedValue('progress-token')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('loads the progress through an authenticated route', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(idleProgress))
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()

    const { result } = renderHook(() => useIndexingProgressQuery(true), {
      wrapper: Wrapper,
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(result.current.data).toEqual(idleProgress)
    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(requestUrl).toMatch(/\/indexing\/progress$/)
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer progress-token',
    )

    queryClient.clear()
  })

  it('does not request tokens or data without indexing access', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()

    const { result } = renderHook(() => useIndexingProgressQuery(false), {
      wrapper: Wrapper,
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mocks.getAccessToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()

    queryClient.clear()
  })

  it('surfaces the backend detail when the request fails', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ detail: 'Forbidden' }, 403),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()

    const { result } = renderHook(() => useIndexingProgressQuery(true), {
      wrapper: Wrapper,
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toEqual(new Error('Forbidden'))

    queryClient.clear()
  })

  it('marks cached progress unavailable after a failed poll and recovers', async () => {
    const runningProgress: IndexingProgress = {
      ...idleProgress,
      status: 'running',
      phase: 'indexing',
      current_source: 'drive',
      sources_total: 1,
      files_processed: 5,
      files_total: 20,
      eta_seconds: 95,
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(runningProgress))
      .mockRejectedValueOnce(new Error('Network disconnected'))
      .mockResolvedValueOnce(
        jsonResponse({
          ...runningProgress,
          files_processed: 10,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { Wrapper, queryClient } = createQueryWrapper()

    const { container } = render(
      <IndexingProgressIndicator
        user={{ role: 'manager', sub: 'manager-user' }}
      />,
      { wrapper: Wrapper },
    )

    expect(await screen.findByText('25%')).toBeTruthy()
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: indexingProgressQueryKeys.progress,
      })
    })

    const unavailableButton = await screen.findByRole('button', {
      name: 'unavailable',
    })
    expect(screen.queryByText('25%')).toBeNull()
    expect(container.querySelector('.animate-spin')).toBeNull()
    expect(
      queryClient.getQueryData(indexingProgressQueryKeys.progress),
    ).toEqual(runningProgress)

    fireEvent.click(unavailableButton)
    expect(await screen.findByText('lastKnownState')).toBeTruthy()
    expect(screen.getByText('lastKnownDescription status.running')).toBeTruthy()
    expect(screen.getByText('drive')).toBeTruthy()
    expect(screen.queryByText('runningDescription')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('eta 1 min 35 sec')).toBeNull()

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: indexingProgressQueryKeys.progress,
      })
    })

    expect(await screen.findByText('50%')).toBeTruthy()
    expect(screen.queryByText('lastKnownState')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('runningDescription')).toBeTruthy()
    queryClient.clear()
  })
})
