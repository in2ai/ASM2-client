// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { useMediaQuery } from './use-media-query'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('responsive media queries', () => {
  it('updates on viewport resize even when no media-query change event arrives', () => {
    const query = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', () => query)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(true)
    act(() => {
      query.matches = false
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(false)
  })
})
