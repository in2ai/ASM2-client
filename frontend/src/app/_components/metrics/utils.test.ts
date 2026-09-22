import { describe, expect, it } from 'vite-plus/test'

import type { MetricsResponse } from './types'
import {
  formatShortDate,
  getMetricsErrorCode,
  isEmptyData,
  isRecoverableError,
  parseMetricDate,
} from './utils'

function createMetricsResponse(
  totalEvents: number,
  uniqueUsers: number,
): MetricsResponse {
  return {
    user_activity: {
      total_events: totalEvents,
      unique_users: uniqueUsers,
    },
  } as MetricsResponse
}

describe('metric bucket dates', () => {
  it('reads a bare day on the local clock, not as UTC midnight', () => {
    // `new Date('2026-09-17')` is UTC midnight, which is 16 Sept anywhere west
    // of Greenwich. The buckets are cut in the viewer's zone server-side, so
    // they have to be read back in it.
    const parsed = parseMetricDate('2026-09-17')

    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(8)
    expect(parsed.getDate()).toBe(17)
  })

  it('keeps the day the API reported when formatting', () => {
    expect(formatShortDate('2026-01-01', 'en')).toContain('01')
    expect(formatShortDate('2026-01-01', 'en')).toContain('Jan')
  })

  it('still accepts full timestamps and Date objects', () => {
    const fromDate = parseMetricDate(new Date(2026, 8, 17))

    expect(fromDate.getDate()).toBe(17)
    expect(parseMetricDate('2026-09-17T10:30:00Z').getTime()).toBe(
      new Date('2026-09-17T10:30:00Z').getTime(),
    )
  })
})

describe('metrics utils', () => {
  it('detects empty metric responses from activity totals', () => {
    expect(isEmptyData(createMetricsResponse(0, 0))).toBe(true)
    expect(isEmptyData(createMetricsResponse(1, 0))).toBe(false)
    expect(isEmptyData(createMetricsResponse(0, 1))).toBe(false)
  })

  it('classifies backend and network errors for dashboard handling', () => {
    expect(getMetricsErrorCode(new Error('401: UNAUTHORIZED'))).toBe(
      'unauthorized',
    )
    expect(
      getMetricsErrorCode('You must be an administrator to see metrics'),
    ).toBe('forbidden')
    expect(getMetricsErrorCode(new Error('404: NOT_FOUND'))).toBe('notFound')
    expect(getMetricsErrorCode(new Error('Request took too long'))).toBe(
      'timeout',
    )
    expect(getMetricsErrorCode(new Error('fetch failed'))).toBe('network')
    expect(getMetricsErrorCode(new Error('500: Failed to calculate'))).toBe(
      'server',
    )
    expect(getMetricsErrorCode(new Error('Unexpected problem'))).toBe('unknown')
  })

  it('marks permission errors as non-recoverable', () => {
    expect(isRecoverableError(new Error('401'))).toBe(false)
    expect(isRecoverableError(new Error('403'))).toBe(false)
    expect(isRecoverableError(new Error('500'))).toBe(true)
    expect(isRecoverableError(new Error('Unexpected problem'))).toBe(true)
  })
})
