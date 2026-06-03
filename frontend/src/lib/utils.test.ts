import { describe, expect, it } from 'vite-plus/test'

import { cn } from './utils'

describe('cn', () => {
  it('combines conditional classes and resolves Tailwind conflicts', () => {
    const maybeHidden: string | false = false

    expect(cn('px-2', maybeHidden, 'px-4', ['text-sm'])).toBe('px-4 text-sm')
  })
})
