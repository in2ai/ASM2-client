import { describe, expect, it } from 'vite-plus/test'
import { normalizeMessageLinks, toMessagePreview } from './message-text'
import { getChatPreview } from './utils'

describe('message text', () => {
  it('keeps generated filenames without unusable sandbox URLs', () => {
    expect(
      normalizeMessageLinks(
        'Download [report.docx](sandbox:/mnt/data/report.docx).',
      ),
    ).toBe('Download report.docx.')
  })
  it('preserves real source links in copied content', () => {
    const content = '[Source](https://example.test/source)'
    expect(normalizeMessageLinks(content)).toBe(content)
  })
  it('uses readable text for sidebar previews', () => {
    expect(
      getChatPreview(
        '## **Result**\n- Read [report](sandbox:/mnt/data/report.csv)',
      ),
    ).toBe('Result Read report')
    expect(
      toMessagePreview('Use `config` and [the source](https://example.test)'),
    ).toBe('Use config and the source')
  })
})
