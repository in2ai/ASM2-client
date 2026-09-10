// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  formatDocumentSize,
  getDocumentFormatLabel,
  getMessageDocument,
  saveBlobAsFile,
} from './chat-document'
import type { ChatMessage } from './types'

function createMessage(metadata: ChatMessage['metadata']): ChatMessage {
  return {
    chat_id: 'chat-1',
    content: 'Assistant response.',
    created_at: '2026-05-13T12:00:00.000Z',
    id: 'assistant-1',
    metadata,
    role: 'assistant',
    status: 'complete',
  }
}

describe('getMessageDocument', () => {
  const validDocument = {
    filename: 'quality-report-2026.pdf',
    format: 'pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    title: 'Quality report 2026',
  }

  it('returns the descriptor of a well-formed document', () => {
    expect(
      getMessageDocument(createMessage({ document: validDocument })),
    ).toEqual(validDocument)
  })

  it('returns null when the message carries no document', () => {
    expect(getMessageDocument(createMessage(null))).toBeNull()
    expect(
      getMessageDocument(createMessage({ detected_lang: 'es' })),
    ).toBeNull()
  })

  it('treats a null title as absent', () => {
    const metadata = {
      document: { ...validDocument, title: null },
    } as unknown as ChatMessage['metadata']

    expect(getMessageDocument(createMessage(metadata))).toEqual({
      filename: validDocument.filename,
      format: validDocument.format,
      mime_type: validDocument.mime_type,
      size_bytes: validDocument.size_bytes,
    })
  })

  it('rejects descriptors with missing or wrongly typed fields', () => {
    const invalidDocuments = [
      { ...validDocument, filename: '' },
      { ...validDocument, filename: 42 },
      { ...validDocument, format: undefined },
      { ...validDocument, mime_type: null },
      { ...validDocument, size_bytes: '2048' },
      { ...validDocument, size_bytes: Number.NaN },
      { ...validDocument, size_bytes: -1 },
      { ...validDocument, title: 42 },
    ]

    for (const document of invalidDocuments) {
      const metadata = { document } as unknown as ChatMessage['metadata']

      expect(getMessageDocument(createMessage(metadata))).toBeNull()
    }
  })
})

describe('formatDocumentSize', () => {
  it('scales bytes to the largest fitting unit', () => {
    expect(formatDocumentSize(0, 'en')).toBe('0 B')
    expect(formatDocumentSize(512, 'en')).toBe('512 B')
    expect(formatDocumentSize(2048, 'en')).toBe('2 KB')
    expect(formatDocumentSize(245_760, 'en')).toBe('240 KB')
    expect(formatDocumentSize(5_452_595, 'en')).toBe('5.2 MB')
  })

  it('formats decimals for the active locale', () => {
    expect(formatDocumentSize(5_452_595, 'es')).toBe('5,2 MB')
  })
})

describe('getDocumentFormatLabel', () => {
  it('prefers the real file extension over the requested format', () => {
    expect(
      getDocumentFormatLabel({
        filename: 'notes.md',
        format: 'markdown',
        mime_type: 'text/markdown; charset=utf-8',
        size_bytes: 10,
      }),
    ).toBe('MD')
  })

  it('falls back to the format when the filename has no extension', () => {
    expect(
      getDocumentFormatLabel({
        filename: 'notes',
        format: 'markdown',
        mime_type: 'text/markdown; charset=utf-8',
        size_bytes: 10,
      }),
    ).toBe('MARKDOWN')
  })
})

describe('saveBlobAsFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('clicks a temporary link and releases the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:document')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const blob = new Blob(['report'], { type: 'application/pdf' })

    saveBlobAsFile(blob, 'report.pdf')

    const link = click.mock.instances[0] as HTMLAnchorElement

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(link.download).toBe('report.pdf')
    expect(link.getAttribute('href')).toBe('blob:document')
    expect(document.body.contains(link)).toBe(false)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:document')
  })
})
