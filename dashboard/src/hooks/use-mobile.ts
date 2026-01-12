import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Determine whether the current viewport is considered mobile based on MOBILE_BREAKPOINT.
 *
 * The value updates automatically when the viewport width crosses the breakpoint.
 *
 * @returns `true` if the viewport width is less than MOBILE_BREAKPOINT, `false` otherwise.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = globalThis.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}