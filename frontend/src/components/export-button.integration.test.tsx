// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { ExportButton } from './export-button'

vi.mock('@logto/react', () => ({
  useLogto: () => ({ getAccessToken: async () => 'test-token' }),
}))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

const payload = {
  metadata: { exportTimestamp: '2026-10-06T12:00:00Z' },
  data: {
    activity_by_day: [],
    hourly_pattern: [],
    response_time_trend: [],
    role_distribution: {},
    search_terms: [],
    topics: [],
    summary: {
      avg_chunks_per_query: 0,
      avg_turn_response_time_ms: 0,
      avg_session_length_seconds: 0,
      total_events: 0,
      unique_users: 0,
    },
    system_health: {
      avg_cpu_percent: null,
      avg_gpu_percent: null,
      avg_ram_percent: null,
      max_cpu_percent: null,
      max_gpu_percent: null,
      max_ram_percent: null,
    },
    token_usage: {
      llm_tokens_in: 0,
      llm_tokens_out: 0,
      rag_tokens_in: 0,
      rag_tokens_out: 0,
      total_tokens: 0,
    },
  },
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CSV export requests', () => {
  it('does not download cached data after a failed refetch and recovers on retry', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json(payload))
      .mockResolvedValueOnce(
        Response.json({ detail: 'Unavailable' }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json(payload))
    vi.stubGlobal('fetch', request)
    const download = vi.fn(() => 'blob:test')
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = download
        static revokeObjectURL = vi.fn()
      },
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ExportButton />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /exportCsv/ }))
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /exportCsv/ })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: /exportCsv/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('errors.generic'),
    )
    expect(download).toHaveBeenCalledTimes(1)
    expect(client.getQueryCache().getAll()[0]?.state.data).toEqual(payload)

    fireEvent.click(screen.getByRole('button', { name: /exportCsv/ }))
    await waitFor(() => expect(download).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).toBeNull()
    client.clear()
  })
})
