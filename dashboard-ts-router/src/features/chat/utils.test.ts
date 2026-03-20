import { describe, expect, it } from 'vitest'

import { getChatPreview, getChatTitle } from './utils'

describe('chat utils', () => {
  it('falls back when the chat title is empty', () => {
    expect(getChatTitle('   ')).toBe('New conversation')
  })

  it('normalizes previews and truncates long content', () => {
    expect(getChatPreview(' hello\n\nworld ')).toBe('hello world')
    expect(getChatPreview('x'.repeat(120))).toMatch(/…$/)
  })
})
