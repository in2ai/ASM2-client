import { toIntlLocale } from '@/i18n/config'
import { type MetricsResponse } from './types'

export const getDateFormatter = (locale: string) =>
  new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Read a metric bucket's date on the local clock.
 *
 * The API returns bare `YYYY-MM-DD` days, and those parse as UTC midnight,
 * which formats as the day before anywhere west of Greenwich. The buckets are
 * already cut in the viewer's zone server-side, so they are read back in it.
 */
export function parseMetricDate(dateValue: string | Date): Date {
  if (typeof dateValue !== 'string') {
    return dateValue
  }

  const parts = DATE_ONLY_PATTERN.exec(dateValue)

  if (!parts) {
    return new Date(dateValue)
  }

  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
}

export function formatShortDate(
  dateValue: string | Date,
  locale: string,
): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: '2-digit',
    month: 'short',
  }).format(parseMetricDate(dateValue))
}

export type MetricsErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'timeout'
  | 'network'
  | 'server'
  | 'unknown'

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}

export function isEmptyData(data: MetricsResponse): boolean {
  return (
    data?.user_activity?.total_events === 0 &&
    data?.user_activity?.unique_users === 0
  )
}

export function getMetricsErrorCode(error: unknown): MetricsErrorCode {
  const errorMessage = getErrorText(error)

  if (
    errorMessage.includes('UNAUTHORIZED') ||
    errorMessage.includes('You must be logged in') ||
    errorMessage.includes('401')
  ) {
    return 'unauthorized'
  }

  if (
    errorMessage.includes('FORBIDDEN') ||
    errorMessage.includes('You must be an administrator') ||
    errorMessage.includes('You do not have permission') ||
    errorMessage.includes('403')
  ) {
    return 'forbidden'
  }

  if (errorMessage.includes('NOT_FOUND') || errorMessage.includes('404')) {
    return 'notFound'
  }

  if (
    errorMessage.includes('TIMEOUT') ||
    errorMessage.includes('took too long')
  ) {
    return 'timeout'
  }

  if (
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('Network request failed')
  ) {
    return 'network'
  }

  if (
    errorMessage.includes('INTERNAL_SERVER_ERROR') ||
    errorMessage.includes('Failed to fetch') ||
    errorMessage.includes('Failed to calculate') ||
    errorMessage.includes('500')
  ) {
    return 'server'
  }

  return 'unknown'
}

export function isRecoverableError(error: unknown): boolean {
  const code = getMetricsErrorCode(error)
  return code !== 'unauthorized' && code !== 'forbidden'
}
