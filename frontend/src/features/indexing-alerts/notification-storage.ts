const LAST_NOTIFIED_ALERT_ID_KEY = 'asm2:indexing-alerts:last-notified:v1'
const LAST_SEEN_ALERT_ID_KEY = 'asm2:indexing-alerts:last-seen:v1'

type AlertIdStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageKey(baseKey: string, userId: string): string {
  return `${baseKey}:${encodeURIComponent(userId)}`
}

function readAlertId(
  storage: AlertIdStorage,
  baseKey: string,
  userId: string,
): number | null {
  const value = storage.getItem(storageKey(baseKey, userId))
  if (value === null) {
    return null
  }

  const alertId = Number(value)
  return Number.isSafeInteger(alertId) && alertId >= 0 ? alertId : null
}

export function readLastNotifiedAlertId(
  storage: AlertIdStorage,
  userId: string,
): number | null {
  return readAlertId(storage, LAST_NOTIFIED_ALERT_ID_KEY, userId)
}

export function rememberLastNotifiedAlertId(
  storage: AlertIdStorage,
  userId: string,
  alertId: number,
): void {
  storage.setItem(
    storageKey(LAST_NOTIFIED_ALERT_ID_KEY, userId),
    String(alertId),
  )
}

export function readLastSeenAlertId(
  storage: AlertIdStorage,
  userId: string,
): number | null {
  return readAlertId(storage, LAST_SEEN_ALERT_ID_KEY, userId)
}

export function rememberLastSeenAlertId(
  storage: AlertIdStorage,
  userId: string,
  alertId: number,
): void {
  storage.setItem(storageKey(LAST_SEEN_ALERT_ID_KEY, userId), String(alertId))
}
