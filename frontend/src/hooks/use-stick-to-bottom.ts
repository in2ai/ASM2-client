import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Within this many pixels of the end counts as "at the bottom".
 *
 * Not zero: sub-pixel layout and a rounded scroll height mean a view scrolled
 * all the way down often reports a couple of pixels short, and a reader who
 * has nudged the wheel once has not meaningfully left the bottom either.
 */
const BOTTOM_THRESHOLD_PX = 96

interface StickToBottom {
  /**
   * Goes to the bottom only if the reader is already there.
   *
   * Reads that condition itself rather than taking it as an argument, so a
   * caller can follow new content from an effect without having to list
   * "are we pinned" among the things that should re-trigger it -- which
   * would make scrolling back down retrigger the follow and fight the reader.
   */
  followIfPinned: (behavior?: ScrollBehavior) => void
  /** True while the view is at (or near) the end of its content. */
  isPinned: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
  viewportRef: (node: HTMLDivElement | null) => void
}

/**
 * Follows new content, but only while the reader is already at the bottom.
 *
 * Scrolling up is a deliberate act -- going back to re-read an earlier answer
 * while the next one is still being written. Pinning unconditionally, as this
 * used to, snatched the view back on every update and made that impossible.
 */
export function useStickToBottom(): StickToBottom {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [isPinned, setIsPinned] = useState(true)
  // Read during scrolling, where a re-render per frame would be wasteful.
  const pinnedRef = useRef(true)

  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    setViewport(node)
  }, [])

  useEffect(() => {
    if (!viewport) {
      return
    }

    const update = () => {
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const pinned = distance <= BOTTOM_THRESHOLD_PX

      if (pinned !== pinnedRef.current) {
        pinnedRef.current = pinned
        setIsPinned(pinned)
      }
    }

    update()
    viewport.addEventListener('scroll', update, { passive: true })

    // Content growing under a reader who is *not* at the bottom must not
    // change whether they are pinned, but content shrinking (a conversation
    // switched away from) can leave the flag stale. Guarded because scroll
    // events alone still keep the flag honest where this is missing.
    const observer = globalThis.ResizeObserver
      ? new globalThis.ResizeObserver(update)
      : undefined
    observer?.observe(viewport)

    return () => {
      viewport.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [viewport])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (!viewport) {
        return
      }

      viewport.scrollTo({ behavior, top: viewport.scrollHeight })
      pinnedRef.current = true
      setIsPinned(true)
    },
    [viewport],
  )

  const followIfPinned = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (pinnedRef.current) {
        scrollToBottom(behavior)
      }
    },
    [scrollToBottom],
  )

  return { followIfPinned, isPinned, scrollToBottom, viewportRef }
}
