import { describe, expect, it } from 'vite-plus/test'
import {
  readLastNotifiedAlertId,
  readLastSeenAlertId,
  rememberLastNotifiedAlertId,
  rememberLastSeenAlertId,
} from './notification-storage'

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('indexing alert notification storage', () => {
  it('stores the last notified alert independently for each user', () => {
    const storage = createMemoryStorage()

    rememberLastNotifiedAlertId(storage, 'manager-1', 10)
    rememberLastNotifiedAlertId(storage, 'manager-2', 20)

    expect(readLastNotifiedAlertId(storage, 'manager-1')).toBe(10)
    expect(readLastNotifiedAlertId(storage, 'manager-2')).toBe(20)
  })

  it('ignores invalid stored values', () => {
    const storage = createMemoryStorage()
    storage.setItem('asm2:indexing-alerts:last-notified:v1:admin-1', 'invalid')

    expect(readLastNotifiedAlertId(storage, 'admin-1')).toBeNull()
  })

  it('tracks the last seen alert separately from the last notified one', () => {
    const storage = createMemoryStorage()

    rememberLastNotifiedAlertId(storage, 'manager-1', 10)
    rememberLastSeenAlertId(storage, 'manager-1', 7)

    expect(readLastNotifiedAlertId(storage, 'manager-1')).toBe(10)
    expect(readLastSeenAlertId(storage, 'manager-1')).toBe(7)
  })

  it('ignores invalid stored last seen values', () => {
    const storage = createMemoryStorage()
    storage.setItem('asm2:indexing-alerts:last-seen:v1:admin-1', 'invalid')

    expect(readLastSeenAlertId(storage, 'admin-1')).toBeNull()
  })
})
