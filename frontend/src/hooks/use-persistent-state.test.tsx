// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { usePersistentState } from './use-persistent-state'

let setValue: ((value: boolean) => void) | undefined

function Harness({ storageKey }: Readonly<{ storageKey: string }>) {
  const [value, set] = usePersistentState(storageKey, true)
  setValue = set

  return <output aria-label="value">{String(value)}</output>
}

describe('usePersistentState', () => {
  beforeEach(() => globalThis.localStorage.clear())

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    setValue = undefined
  })

  it('starts from the initial value when nothing was stored', () => {
    render(<Harness storageKey="k" />)

    expect(screen.getByLabelText('value').textContent).toBe('true')
  })

  it('writes every change back', () => {
    render(<Harness storageKey="k" />)

    act(() => setValue?.(false))

    expect(screen.getByLabelText('value').textContent).toBe('false')
    expect(globalThis.localStorage.getItem('k')).toBe('false')
  })

  it('picks up what an earlier visit stored', () => {
    globalThis.localStorage.setItem('k', 'false')

    render(<Harness storageKey="k" />)

    expect(screen.getByLabelText('value').textContent).toBe('false')
  })

  it('falls back to the initial value when what was stored is not readable', () => {
    globalThis.localStorage.setItem('k', 'not json')

    render(<Harness storageKey="k" />)

    expect(screen.getByLabelText('value').textContent).toBe('true')
  })

  it('still works where storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    render(<Harness storageKey="k" />)
    act(() => setValue?.(false))

    expect(screen.getByLabelText('value').textContent).toBe('false')
  })
})
