import { describe, expect, it } from 'vite-plus/test'

import type { MetricsResponse } from './types'
import { getMetricsErrorCode, isEmptyData, isRecoverableError } from './utils'

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
