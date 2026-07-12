import { describe, expect, it } from 'vite-plus/test'
import { parseDeletionThreshold, selectAlertsToNotify } from './logic'
import type { IndexingDeletionAlert } from './types'

function deletionAlert(id: number): IndexingDeletionAlert {
  return {
    id,
    source: 'drive',
    deleted_documents: 40,
    total_documents: 100,
    percentage: 40,
    threshold_percentage: 40,
    created_at: '2026-07-01T10:00:00.000Z',
  }
}

describe('indexing alert logic', () => {
  it('accepts thresholds from 1 to 100, including decimal percentages', () => {
    expect(parseDeletionThreshold('1')).toBe(1)
    expect(parseDeletionThreshold('40.5')).toBe(40.5)
    expect(parseDeletionThreshold('40,5')).toBe(40.5)
    expect(parseDeletionThreshold('100')).toBe(100)
  })

  it('rejects empty, non-numeric, and out-of-range thresholds', () => {
    expect(parseDeletionThreshold('')).toBeNull()
    expect(parseDeletionThreshold('not-a-number')).toBeNull()
    expect(parseDeletionThreshold('0')).toBeNull()
    expect(parseDeletionThreshold('101')).toBeNull()
  })

  it('notifies only the latest unseen alert on the initial fetch', () => {
    const oldAlert = deletionAlert(1)
    const latestAlert = deletionAlert(2)

    expect(selectAlertsToNotify([oldAlert, latestAlert], null)).toEqual([
      latestAlert,
    ])
  })

  it('notifies alerts newer than the last notified ID', () => {
    const alerts = [deletionAlert(1), deletionAlert(2), deletionAlert(3)]

    expect(selectAlertsToNotify(alerts, 1)).toEqual([
      deletionAlert(2),
      deletionAlert(3),
    ])
  })
})
