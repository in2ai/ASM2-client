// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useStickToBottom } from './use-stick-to-bottom'

/** jsdom lays nothing out, so the scroll geometry is set by hand. */
function setGeometry(
  node: HTMLElement,
  geometry: { clientHeight: number; scrollHeight: number; scrollTop: number },
) {
  for (const [name, value] of Object.entries(geometry)) {
    Object.defineProperty(node, name, { configurable: true, value })
  }
}

let latest: ReturnType<typeof useStickToBottom> | undefined

function Harness() {
  const stick = useStickToBottom()
  latest = stick

  useEffect(() => {
    const node = document.querySelector<HTMLDivElement>('#viewport')
    stick.viewportRef(node)
  }, [stick])

  return <div id="viewport" />
}

function renderAt(geometry: {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}) {
  const result = render(<Harness />)
  const viewport = document.querySelector<HTMLDivElement>('#viewport')!

  setGeometry(viewport, geometry)
  // Held separately: reading the spy back off the element would be an
  // unbound method reference.
  const scrollTo = vi.fn()
  viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo

  act(() => {
    viewport.dispatchEvent(new Event('scroll'))
  })

  return { result, scrollTo, viewport }
}

describe('useStickToBottom', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    cleanup()
    latest = undefined
  })

  it('counts a view scrolled to the end as pinned', () => {
    renderAt({ clientHeight: 400, scrollHeight: 1000, scrollTop: 600 })

    expect(latest?.isPinned).toBe(true)
  })

  it('tolerates the last few pixels, which layout rounding costs', () => {
    renderAt({ clientHeight: 400, scrollHeight: 1000, scrollTop: 580 })

    expect(latest?.isPinned).toBe(true)
  })

  it('lets go once the reader has scrolled up to read', () => {
    renderAt({ clientHeight: 400, scrollHeight: 1000, scrollTop: 100 })

    expect(latest?.isPinned).toBe(false)
  })

  it('takes hold again when asked to go back to the bottom', () => {
    const { scrollTo } = renderAt({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 100,
    })

    expect(latest?.isPinned).toBe(false)

    act(() => {
      latest?.scrollToBottom()
    })

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 1000,
    })
    expect(latest?.isPinned).toBe(true)
  })

  it('jumps without animation when told to', () => {
    const { scrollTo } = renderAt({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 100,
    })

    act(() => {
      latest?.scrollToBottom('auto')
    })

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      top: 1000,
    })
  })
})

describe('useStickToBottom following new content', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    cleanup()
    latest = undefined
  })

  it('follows while the reader is at the bottom', () => {
    const { scrollTo } = renderAt({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 600,
    })

    act(() => {
      latest?.followIfPinned()
    })

    expect(scrollTo).toHaveBeenCalledOnce()
  })

  it('stays put while the reader is reading further up', () => {
    const { scrollTo } = renderAt({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 0,
    })

    act(() => {
      latest?.followIfPinned()
    })

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
