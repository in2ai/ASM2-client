import { type AppLocale, toIntlLocale } from '@/i18n/config'
import type { ChatDocument, ChatMessage } from './types'

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

/**
 * Reads the generated-document descriptor a message carries, if any.
 *
 * Message metadata is free-form JSON coming from the backend, so every field is
 * validated before the conversation renders a download for it.
 */
export function getMessageDocument(message: ChatMessage): ChatDocument | null {
  const candidate: unknown = message.metadata?.document

  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  if (
    !('filename' in candidate) ||
    typeof candidate.filename !== 'string' ||
    !candidate.filename.trim() ||
    !('format' in candidate) ||
    typeof candidate.format !== 'string' ||
    !('mime_type' in candidate) ||
    typeof candidate.mime_type !== 'string' ||
    !('size_bytes' in candidate) ||
    typeof candidate.size_bytes !== 'number' ||
    !Number.isFinite(candidate.size_bytes) ||
    candidate.size_bytes < 0
  ) {
    return null
  }

  const title = 'title' in candidate ? candidate.title : undefined
  if (title !== undefined && title !== null && typeof title !== 'string') {
    return null
  }

  return {
    filename: candidate.filename,
    format: candidate.format,
    mime_type: candidate.mime_type,
    size_bytes: candidate.size_bytes,
    ...(typeof title === 'string' ? { title } : {}),
  }
}

export function formatDocumentSize(bytes: number, locale: AppLocale) {
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const formatted = new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(size)

  return `${formatted} ${SIZE_UNITS[unitIndex]}`
}

export function getDocumentFormatLabel(document: ChatDocument) {
  const lastDot = document.filename.lastIndexOf('.')
  const extension = lastDot > 0 ? document.filename.slice(lastDot + 1) : ''

  return (extension || document.format).toUpperCase()
}

/** Hands a downloaded document to the browser under its own filename. */
export function saveBlobAsFile(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  link.rel = 'noreferrer'
  document.body.append(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(objectUrl)
}
