import { type AppLocale, toIntlLocale } from '@/i18n/config'

export const DEFAULT_CHAT_TITLE = 'New conversation'
const PREVIEW_LIMIT = 88

export function getChatTitle(
  title: string | null | undefined,
  fallback = DEFAULT_CHAT_TITLE,
) {
  const normalized = title?.trim()
  return normalized ? normalized : fallback
}

export function getChatPreview(preview: string | null | undefined) {
  const normalized = preview?.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  if (normalized.length <= PREVIEW_LIMIT) {
    return normalized
  }

  return `${normalized.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`
}

export function formatChatTimestamp(timestamp: string, locale: AppLocale) {
  const date = new Date(timestamp)
  const intlLocale = toIntlLocale(locale)
  const now = new Date()
  const isSameDay = date.toDateString() === now.toDateString()

  return new Intl.DateTimeFormat(intlLocale, {
    day: isSameDay ? undefined : '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: isSameDay ? undefined : 'short',
  }).format(date)
}

export function formatMessageTimestamp(timestamp: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
