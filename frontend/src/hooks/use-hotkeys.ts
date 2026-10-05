import { useEffect, useRef } from 'react'

export interface Hotkey {
  /** Requires the platform's command key: ⌘ on macOS, Ctrl elsewhere. */
  readonly mod?: boolean
  readonly shift?: boolean
  /** Compared case-insensitively against `event.key`. */
  readonly key: string
  readonly onPress: () => void
}

/** True where the user is typing, and a bare letter is a letter. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * Binds keyboard shortcuts for as long as the component is mounted.
 *
 * A shortcut with a modifier fires wherever focus is; one without is held back
 * while the user is typing, so Escape can close a panel but a plain letter
 * never steals a keystroke from the composer.
 */
export function useHotkeys(hotkeys: readonly Hotkey[]): void {
  // Read at keypress time, so a re-render with new handlers does not have to
  // tear down and re-add the listener.
  const latest = useRef(hotkeys)
  latest.current = hotkeys

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const usesMod = event.metaKey || event.ctrlKey

      for (const hotkey of latest.current) {
        if (event.key.toLowerCase() !== hotkey.key.toLowerCase()) {
          continue
        }
        if (Boolean(hotkey.mod) !== usesMod) {
          continue
        }
        if (Boolean(hotkey.shift) !== event.shiftKey) {
          continue
        }
        if (!hotkey.mod && isTypingTarget(event.target)) {
          continue
        }

        event.preventDefault()
        hotkey.onPress()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
