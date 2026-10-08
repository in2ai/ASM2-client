// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { I18nProvider } from '@/i18n/provider'
import { loadDictionary } from '@/i18n/dictionary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import type { DashboardMetrics, StatsMetrics } from '@/lib/metrics-api'
import { MetricsDashboard } from './metrics-dashboard'

vi.mock('@logto/react', () => ({
  useLogto: () => ({ getAccessToken: async () => 'test-token' }),
}))

const metrics: DashboardMetrics = {
  metadata: { updatedAt: '2026-10-08T12:00:00Z' },
  metrics: { total_count: 123, turn_response_time: 2 },
  top_words: [],
  top_topics: [],
  user_activity: {
    mean_session_length_seconds: 30,
    unique_users: 7,
    total_events: 42,
    role_distribution: {},
    by_day: [{ date: '2026-10-08', event_count: 42, unique_users: 7 }],
    hourly_pattern: [],
  },
  rag_quality: {
    avg_chunks_per_query: 2,
    response_time_trend: [],
    token_usage: {
      llm_tokens_in: 100,
      llm_tokens_out: 50,
      rag_tokens_in: 20,
      rag_tokens_out: 10,
    },
    system_health: {
      avg_cpu: null,
      avg_ram: null,
      avg_gpu: null,
      max_cpu: null,
      max_ram: null,
      max_gpu: null,
    },
  },
}

const stats: StatsMetrics = {
  totalMetricsRecords: 123,
  totalEvents: 42,
  avgTurnResponseTimeMs: 2000,
  avgSessionLength: 30,
  uniqueUsers: 7,
}

let client: QueryClient

beforeEach(async () => {
  localStorage.setItem('asm2.locale', 'en')
  await loadDictionary('en')
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  cleanup()
  client.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function mockRequests() {
  const dashboard = vi.fn(() => Promise.resolve(Response.json(metrics)))
  const records = vi.fn(() => Promise.resolve(Response.json(stats)))
  vi.stubGlobal('fetch', (url: string) => {
    if (new URL(url).pathname.endsWith('/metrics/dashboard')) return dashboard()
    if (new URL(url).pathname.endsWith('/metrics/stats')) return records()
    throw new Error(`Unexpected request: ${url}`)
  })
  return { dashboard, records }
}

function TestDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>()
  return (
    <MetricsDashboard
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onViewChange={() => {}}
      user={{ sub: 'test-viewer' }}
      view="overview"
    />
  )
}

function mountDashboard() {
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <TooltipProvider>
          <TestDashboard />
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('dashboard refresh', () => {
  it('keeps the rendered chart after a background failure and retries metrics and records together', async () => {
    const { dashboard, records } = mockRequests()
    const { container } = mountDashboard()
    await screen.findByText('Recent activity')
    const chart = container.querySelector('[data-slot="chart"]')
    expect(chart).not.toBeNull()

    dashboard.mockResolvedValueOnce(
      Response.json({ detail: 'Unavailable' }, { status: 503 }),
    )
    await act(async () => {
      await client.refetchQueries({ queryKey: ['metrics', 'dashboard'] })
    })

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain(
      'Showing the last successfully loaded results',
    )
    expect(container.querySelector('[data-slot="chart"]')).toBe(chart)
    expect(screen.getByText('123 records')).toBeTruthy()

    let finishRecords: ((response: Response) => void) | undefined
    records.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRecords = resolve
      }),
    )
    dashboard.mockResolvedValueOnce(
      Response.json({
        ...metrics,
        metrics: { ...metrics.metrics, total_count: 456 },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('456')
    expect(
      screen.getByRole('button', { name: 'Refresh' }).hasAttribute('disabled'),
    ).toBe(true)
    expect(records).toHaveBeenCalledTimes(2)

    await act(async () =>
      finishRecords?.(Response.json({ ...stats, totalMetricsRecords: 456 })),
    )
    await screen.findByText('456 records')
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Refresh' })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('[data-slot="chart"]')).toBe(chart)
  })

  it('shows the full error state when the first request fails', async () => {
    const { dashboard } = mockRequests()
    dashboard.mockResolvedValueOnce(
      Response.json({ detail: 'Unavailable' }, { status: 503 }),
    )
    mountDashboard()
    await screen.findByText('Error loading metrics')
    expect(screen.queryByText('Recent activity')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('does not keep results from a different date range after the new range fails', async () => {
    const { dashboard } = mockRequests()
    mountDashboard()
    await screen.findByText('Recent activity')
    dashboard.mockResolvedValueOnce(
      Response.json({ detail: 'Unavailable' }, { status: 503 }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Last 7 days/ }))
    await screen.findByText('Error loading metrics')
    expect(screen.queryByText('Recent activity')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([401, 403])(
    'hides cached charts when access fails with %s',
    async (status) => {
      const { dashboard } = mockRequests()
      mountDashboard()
      await screen.findByText('Recent activity')
      dashboard.mockResolvedValueOnce(
        Response.json({ detail: 'Access denied' }, { status }),
      )
      await act(async () => {
        await client.refetchQueries({ queryKey: ['metrics', 'dashboard'] })
      })
      await screen.findByText(
        status === 401 ? 'Unauthorized access' : 'Access denied',
      )
      expect(screen.queryByText('Recent activity')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )
})
