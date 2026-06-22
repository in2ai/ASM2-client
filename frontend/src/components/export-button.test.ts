import { describe, expect, it } from 'vite-plus/test'

import type { RouterOutputs } from '@/trpc/react'
import { generateCSV, generateFilename } from './export-button'

type ExportMetricsOutput = RouterOutputs['metrics']['exportMetrics']

const exportPayload: ExportMetricsOutput = {
  data: {
    activity_by_day: [
      {
        date: '2026-05-01',
        event_count: 7,
        unique_users: 3,
      },
    ],
    hourly_pattern: [{ event_count: 4, hour: 9 }],
    response_time_trend: [
      {
        date: '2026-05-01',
        doc_response_time: 0.456,
        llm_response_time: 0.123,
      },
    ],
    role_distribution: {
      admin: 1,
      'user,internal': 2,
    },
    search_terms: [{ count: 5, word: 'contract, renewal' }],
    summary: {
      avg_docs_per_query: 2.5,
      avg_llm_response_time_ms: 123.456,
      avg_session_length_seconds: 45.67,
      total_events: 11,
      unique_users: 4,
    },
    system_health: {
      avg_cpu_percent: 12.3,
      avg_gpu_percent: 56.7,
      avg_ram_percent: 34.5,
      max_cpu_percent: 22.3,
      max_gpu_percent: 66.7,
      max_ram_percent: 44.5,
    },
    token_usage: {
      llm_tokens_in: 100,
      llm_tokens_out: 50,
      rag_tokens_in: 30,
      rag_tokens_out: 20,
      total_tokens: 200,
    },
    topics: [{ count: 2, topic: 'policy "A"' }],
  },
  metadata: {
    endDate: '2026-05-31T23:59:59.000Z',
    exportTimestamp: '2026-06-03T12:00:00.000Z',
    startDate: '2026-05-01T00:00:00.000Z',
    userId: 'user-1',
  },
}

describe('export helpers', () => {
  it('generates localized CSV content with escaped cells', () => {
    const csv = generateCSV(exportPayload, 'en')

    expect(csv).toContain('# ASM2 Metrics Export Report')
    expect(csv).toContain('=== SUMMARY ===')
    expect(csv).toContain('Unique users,4,users')
    expect(csv).toContain('LLM,100,50,150')
    expect(csv).toContain('"user,internal",2')
    expect(csv).toContain('"contract, renewal",5')
    expect(csv).toContain('"policy ""A""",2')
    expect(csv).toContain('2026-05-01,123.00,456.00')
  })

  it('uses Spanish copy for non-English exports', () => {
    const csv = generateCSV(exportPayload, 'es')

    expect(csv).toContain('# Exportado:')
    expect(csv).toContain('=== RESUMEN GENERAL ===')
    expect(csv).toContain('Usuarios unicos,4,usuarios')
  })

  it('builds filenames from available date metadata', () => {
    expect(generateFilename(exportPayload.metadata)).toBe(
      'asm2_metrics_2026-05-01_to_2026-05-31_2026-06-03.csv',
    )
    expect(
      generateFilename({
        exportTimestamp: '2026-06-03T12:00:00.000Z',
        startDate: '2026-05-01T00:00:00.000Z',
      }),
    ).toBe('asm2_metrics_from_2026-05-01_2026-06-03.csv')
    expect(
      generateFilename({
        endDate: '2026-05-31T23:59:59.000Z',
        exportTimestamp: '2026-06-03T12:00:00.000Z',
      }),
    ).toBe('asm2_metrics_until_2026-05-31_2026-06-03.csv')
  })
})
