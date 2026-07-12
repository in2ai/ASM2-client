const LAST_NOTIFIED_ALERT_ID_KEY = 'asm2:indexing-alerts:last-notified:v1'

type AlertIdStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageKey(userId: string): string {
  return `${LAST_NOTIFIED_ALERT_ID_KEY}:${encodeURIComponent(userId)}`
}

export function readLastNotifiedAlertId(
  storage: AlertIdStorage,
  userId: string,
): number | null {
  const value = storage.getItem(storageKey(userId))
  if (value === null) {
    return null
  }

  const alertId = Number(value)
  return Number.isSafeInteger(alertId) && alertId >= 0 ? alertId : null
}

export function rememberLastNotifiedAlertId(
  storage: AlertIdStorage,
  userId: string,
  alertId: number,
): void {
  storage.setItem(storageKey(userId), String(alertId))
}
