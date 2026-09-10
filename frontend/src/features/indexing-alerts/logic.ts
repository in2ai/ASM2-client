import type { IndexingDeletionAlert } from './types'

export function parseDeletionThreshold(value: string): number | null {
  if (!value.trim()) {
    return null
  }

  const threshold = Number(value.replace(',', '.'))
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
    return null
  }

  return threshold
}

export function countUnseenAlerts(
  alerts: IndexingDeletionAlert[],
  lastSeenAlertId: number | null,
): number {
  if (lastSeenAlertId === null) {
    return alerts.length
  }

  return alerts.filter((alert) => alert.id > lastSeenAlertId).length
}

export function getLatestAlertId(alerts: IndexingDeletionAlert[]): number {
  return alerts.reduce(
    (latestId, alert) => Math.max(alert.id, latestId),
    -Infinity,
  )
}

export function selectAlertsToNotify(
  alerts: IndexingDeletionAlert[],
  lastNotifiedAlertId: number | null,
): IndexingDeletionAlert[] {
  const chronologicalAlerts = [...alerts].sort(
    (left, right) => left.id - right.id,
  )
  if (chronologicalAlerts.length === 0) {
    return []
  }

  if (lastNotifiedAlertId === null) {
    return [chronologicalAlerts.at(-1)!]
  }

  return chronologicalAlerts.filter((alert) => alert.id > lastNotifiedAlertId)
}
