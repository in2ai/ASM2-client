import { type AppLocale, toIntlLocale } from '@/i18n/config'
import { toMessagePreview } from './message-text'

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
  const normalized = preview
    ? toMessagePreview(preview).replace(/\s+/g, ' ').trim()
    : ''
  if (!normalized) {
    return ''
  }

  if (normalized.length <= PREVIEW_LIMIT) {
    return normalized
  }

  return `${normalized.slice(0, PREVIEW_LIMIT - 1).trimEnd()}…`
}

/** How much of its date a timestamp has to give to be read right. */
type TimestampPrecision = 'time' | 'day' | 'year'

const TIMESTAMP_OPTIONS: Record<
  TimestampPrecision,
  Intl.DateTimeFormatOptions
> = {
  time: { hour: '2-digit', minute: '2-digit' },
  day: { day: '2-digit', hour: '2-digit', minute: '2-digit', month: 'short' },
  year: {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  },
}

/**
 * One formatter per locale and precision, made the first time it is asked
 * for. Building one costs tens of microseconds, and the sidebar formats a
 * timestamp for every conversation each time it renders.
 */
const timestampFormats = new Map<string, Intl.DateTimeFormat>()

function getTimestampFormat(locale: AppLocale, precision: TimestampPrecision) {
  const key = `${locale}:${precision}`
  let format = timestampFormats.get(key)

  if (!format) {
    format = new Intl.DateTimeFormat(
      toIntlLocale(locale),
      TIMESTAMP_OPTIONS[precision],
    )
    timestampFormats.set(key, format)
  }

  return format
}

/**
 * When something happened, in as much detail as it takes: the time alone for
 * today, the day as well before that, and the year too once it is not this
 * one. A message showed its time only, so last week's read as this morning's.
 */
export function formatTimestamp(
  timestamp: string,
  locale: AppLocale,
  now = new Date(),
) {
  const date = new Date(timestamp)
  let precision: TimestampPrecision = 'year'

  if (date.toDateString() === now.toDateString()) {
    precision = 'time'
  } else if (date.getFullYear() === now.getFullYear()) {
    precision = 'day'
  }

  return getTimestampFormat(locale, precision).format(date)
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
