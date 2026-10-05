import { useCallback, useEffect, useState } from 'react'

/**
 * State that survives a reload, kept in `localStorage`.
 *
 * Storage can throw or be empty -- a private window, cleared site data, a
 * browser with storage blocked -- so every access is guarded and the initial
 * value stands in whenever reading fails.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = globalThis.localStorage?.getItem(key)
      return stored === null || stored === undefined
        ? initialValue
        : (JSON.parse(stored) as T)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      // Nothing to do: the value still works for this session.
    }
  }, [key, value])

  return [value, useCallback((next: T) => setValue(next), [])]
}
