import type { MessageKey } from '@/i18n/dictionary'
import { INDEXING_PHASES, INDEXING_STATUSES } from './types'
import type { IndexingPhase, IndexingProgress, IndexingStatus } from './types'

export function isIndexingRunning(
  progress: IndexingProgress | undefined,
): boolean {
  return progress?.status === 'running'
}

/**
 * Percentage of the files of the current phase that are already indexed.
 * Phases that do not count files report no percentage, so the caller can
 * show an indeterminate indicator instead of a misleading zero.
 */
export function selectFileProgressPercentage(
  progress: IndexingProgress | undefined,
): number | null {
  if (!progress || progress.files_total <= 0) {
    return null
  }

  const percentage = (progress.files_processed / progress.files_total) * 100

  return Math.min(Math.max(Math.round(percentage), 0), 100)
}

export function hasCompletedRun(
  progress: IndexingProgress | undefined,
): boolean {
  return Boolean(progress?.finished_at) && !isIndexingRunning(progress)
}

export interface DurationUnitFormatters {
  hour: Intl.NumberFormat
  minute: Intl.NumberFormat
  second: Intl.NumberFormat
}

/**
 * Remaining time with the unit of every number spelled out in the active
 * locale ("8 min 33 s"), so it cannot be read as a clock time or as hours.
 *
 * Seconds are dropped past the hour, where they say nothing about an estimate.
 */
export function formatRemainingTime(
  seconds: number | null,
  formatters: DurationUnitFormatters,
): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null
  }

  const totalSeconds = Math.round(seconds)

  if (totalSeconds < 60) {
    return formatters.second.format(totalSeconds)
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60

    return remainingSeconds === 0
      ? formatters.minute.format(minutes)
      : `${formatters.minute.format(minutes)} ${formatters.second.format(remainingSeconds)}`
  }

  // Rounding the total avoids reporting "1 h 60 min" on the last half minute.
  const totalMinutes = Math.round(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return minutes === 0
    ? formatters.hour.format(hours)
    : `${formatters.hour.format(hours)} ${formatters.minute.format(minutes)}`
}

/**
 * These three narrow a value the backend sent into a message key.
 *
 * The return types are the keys the catalogue defines, so a status or phase
 * added on the backend without wording to match fails to compile here rather
 * than showing its own key path on screen.
 */
export function statusLabelKey(
  status: string | undefined,
): MessageKey<'IndexingProgress'> {
  return INDEXING_STATUSES.includes(status as IndexingStatus)
    ? (`status.${status as IndexingStatus}` as const)
    : 'status.unknown'
}

export function statusDescriptionKey(
  status: string | undefined,
): MessageKey<'IndexingProgress'> {
  return INDEXING_STATUSES.includes(status as IndexingStatus)
    ? (`statusDescription.${status as IndexingStatus}` as const)
    : 'statusDescription.unknown'
}

export function phaseLabelKey(
  phase: string | null | undefined,
): MessageKey<'IndexingProgress'> {
  return INDEXING_PHASES.includes(phase as IndexingPhase)
    ? (`phase.${phase as IndexingPhase}` as const)
    : 'phase.unknown'
}

export function needsAttention(
  progress: IndexingProgress | undefined,
): boolean {
  return (
    progress?.status === 'failed' ||
    progress?.status === 'blocked' ||
    progress?.status === 'interrupted'
  )
}
