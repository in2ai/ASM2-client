import { useEffect, useState } from 'react'

/**
 * Whether a CSS media query currently matches, kept in step as it changes.
 *
 * Reading `window.innerWidth` inside a handler, as the layouts used to, only
 * answers the question at the moment of the click: resize past the breakpoint
 * afterwards and the component is still acting on the old answer.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => globalThis.matchMedia?.(query).matches ?? false,
  )

  useEffect(() => {
    const list = globalThis.matchMedia(query)
    const update = () => setMatches(list.matches)

    update()
    list.addEventListener('change', update)

    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}

/** The `lg` breakpoint, where both layouts give the sidebar its own column. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
