import { useEffect, useRef } from 'react'

/** Keep keyboard focus inside an open mobile drawer and restore its opener. */
export function useDrawerFocus(open: boolean) {
  const drawerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const drawer = drawerRef.current
    if (!open || !drawer) return
    const opener = document.activeElement
    const controls = () =>
      [
        ...drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0)
    controls()[0]?.focus({ preventScroll: true })

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = controls()
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    drawer.addEventListener('keydown', trapFocus)
    return () => {
      drawer.removeEventListener('keydown', trapFocus)
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true })
    }
  }, [open])

  return drawerRef
}
