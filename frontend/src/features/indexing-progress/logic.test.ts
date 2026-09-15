import { describe, expect, it } from 'vite-plus/test'
import {
  formatRemainingTime,
  hasCompletedRun,
  isIndexingRunning,
  needsAttention,
  phaseLabelKey,
  selectFileProgressPercentage,
  statusDescriptionKey,
  statusLabelKey,
} from './logic'
import type { IndexingProgress } from './types'

function buildProgress(
  overrides: Partial<IndexingProgress> = {},
): IndexingProgress {
  return {
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
    ...overrides,
  }
}

describe('isIndexingRunning', () => {
  it('reports a run in progress', () => {
    expect(isIndexingRunning(buildProgress({ status: 'running' }))).toBe(true)
  })

  it('treats a missing payload as not running', () => {
    expect(isIndexingRunning(undefined)).toBe(false)
    expect(isIndexingRunning(buildProgress({ status: 'completed' }))).toBe(
      false,
    )
  })
})

describe('selectFileProgressPercentage', () => {
  it('reports the share of files already indexed', () => {
    const progress = buildProgress({
      status: 'running',
      files_processed: 3,
      files_total: 8,
    })

    expect(selectFileProgressPercentage(progress)).toBe(38)
  })

  it('reports no percentage for phases without a file count', () => {
    const progress = buildProgress({
      status: 'running',
      files_processed: 0,
      files_total: 0,
    })

    expect(selectFileProgressPercentage(progress)).toBeNull()
    expect(selectFileProgressPercentage(undefined)).toBeNull()
  })

  it('never goes above the full bar', () => {
    const progress = buildProgress({
      status: 'running',
      files_processed: 12,
      files_total: 10,
    })

    expect(selectFileProgressPercentage(progress)).toBe(100)
  })
})

describe('hasCompletedRun', () => {
  it('detects a finished run', () => {
    const progress = buildProgress({
      status: 'completed',
      finished_at: '2026-09-07T10:30:00Z',
    })

    expect(hasCompletedRun(progress)).toBe(true)
  })

  it('does not treat a run in progress as finished', () => {
    const progress = buildProgress({
      status: 'running',
      finished_at: '2026-09-07T09:00:00Z',
    })

    expect(hasCompletedRun(progress)).toBe(false)
  })
})

describe('formatRemainingTime', () => {
  const formatters = {
    hour: new Intl.NumberFormat('es-ES', {
      style: 'unit',
      unit: 'hour',
      unitDisplay: 'short',
    }),
    minute: new Intl.NumberFormat('es-ES', {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'short',
    }),
    second: new Intl.NumberFormat('es-ES', {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'short',
    }),
  }

  it('names the unit of every number', () => {
    expect(formatRemainingTime(95, formatters)).toBe('1 min 35 s')
  })

  it('reports seconds alone under a minute', () => {
    expect(formatRemainingTime(42, formatters)).toBe('42 s')
  })

  it('drops the seconds past the hour', () => {
    expect(formatRemainingTime(3725, formatters)).toBe('1 h 2 min')
  })

  it('keeps the seconds on the last minute below an hour', () => {
    expect(formatRemainingTime(3598, formatters)).toBe('59 min 58 s')
  })

  it('never reports sixty minutes', () => {
    // 1 h 59 min 58 s rounds up to a whole hour count.
    expect(formatRemainingTime(7198, formatters)).toBe('2 h')
  })

  it('omits the empty part of a round duration', () => {
    expect(formatRemainingTime(120, formatters)).toBe('2 min')
    expect(formatRemainingTime(7200, formatters)).toBe('2 h')
  })

  it('translates the units of the active locale', () => {
    const englishFormatters = {
      hour: new Intl.NumberFormat('en-US', {
        style: 'unit',
        unit: 'hour',
        unitDisplay: 'short',
      }),
      minute: new Intl.NumberFormat('en-US', {
        style: 'unit',
        unit: 'minute',
        unitDisplay: 'short',
      }),
      second: new Intl.NumberFormat('en-US', {
        style: 'unit',
        unit: 'second',
        unitDisplay: 'short',
      }),
    }

    expect(formatRemainingTime(95, englishFormatters)).toBe('1 min 35 sec')
  })

  it('rejects missing and invalid durations', () => {
    expect(formatRemainingTime(null, formatters)).toBeNull()
    expect(formatRemainingTime(-1, formatters)).toBeNull()
    expect(formatRemainingTime(Number.POSITIVE_INFINITY, formatters)).toBeNull()
  })
})

describe('translation keys', () => {
  it('maps known statuses and phases', () => {
    expect(statusLabelKey('blocked')).toBe('status.blocked')
    expect(statusDescriptionKey('failed')).toBe('statusDescription.failed')
    expect(phaseLabelKey('listing_sources')).toBe('phase.listing_sources')
  })

  it('falls back when the backend reports something unknown', () => {
    expect(statusLabelKey('teleporting')).toBe('status.unknown')
    expect(statusDescriptionKey(undefined)).toBe('statusDescription.unknown')
    expect(phaseLabelKey(null)).toBe('phase.unknown')
  })
})

describe('needsAttention', () => {
  it('flags the runs a manager has to look at', () => {
    expect(needsAttention(buildProgress({ status: 'failed' }))).toBe(true)
    expect(needsAttention(buildProgress({ status: 'blocked' }))).toBe(true)
    expect(needsAttention(buildProgress({ status: 'interrupted' }))).toBe(true)
  })

  it('leaves healthy states alone', () => {
    expect(needsAttention(buildProgress({ status: 'completed' }))).toBe(false)
    expect(needsAttention(buildProgress({ status: 'running' }))).toBe(false)
    expect(needsAttention(undefined)).toBe(false)
  })
})
