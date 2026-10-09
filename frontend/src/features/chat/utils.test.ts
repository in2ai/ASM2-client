import { describe, expect, it } from 'vite-plus/test'

import { formatTimestamp, getChatPreview, getChatTitle } from './utils'

describe('chat utils', () => {
  it('falls back when the chat title is empty', () => {
    expect(getChatTitle('   ')).toBe('New conversation')
  })

  it('normalizes previews and truncates long content', () => {
    expect(getChatPreview(' hello\n\nworld ')).toBe('hello world')
    expect(getChatPreview('x'.repeat(120))).toMatch(/…$/)
  })

  describe('formatTimestamp', () => {
    // Local dates, as the reader's calendar is what decides "today".
    const now = new Date(2026, 9, 8, 18, 0)
    const at = (...parts: [number, number, number, number, number]) =>
      new Date(...parts).toISOString()

    it('gives the time alone for today', () => {
      const formatted = formatTimestamp(at(2026, 9, 8, 14, 32), 'en', now)

      expect(formatted).toContain('02:32')
      expect(formatted).not.toContain('Oct')
    })

    it('adds the day for earlier this year', () => {
      const formatted = formatTimestamp(at(2026, 9, 1, 14, 32), 'en', now)

      expect(formatted).toContain('Oct 01')
      expect(formatted).toContain('02:32')
      expect(formatted).not.toContain('2026')
    })

    it('adds the year once it is not this one', () => {
      const formatted = formatTimestamp(at(2025, 9, 1, 14, 32), 'en', now)

      expect(formatted).toContain('Oct 01')
      expect(formatted).toContain('2025')
    })
  })
})
