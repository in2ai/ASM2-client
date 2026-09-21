import type { ChatProgressEvent, ChatProgressPhase } from './types'

const PHASES: ReadonlySet<ChatProgressPhase> = new Set([
  'understanding',
  'thinking',
  'searching',
  'reading',
  'expanding',
  'refining',
  'writing_document',
  'composing',
  'summarizing',
])

export interface ProgressDescription {
  /** A key under the `ChatPage` namespace. */
  key: string
  values?: Record<string, string | number>
}

/**
 * Reads a progress report coming off the wire.
 *
 * Progress is free-form JSON from the backend, and a backend that learns a new
 * phase must not break a client that has not learned it yet, so anything this
 * version does not recognize is dropped.
 */
export function parseProgressEvent(payload: unknown): ChatProgressEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = payload as Partial<ChatProgressEvent>

  if (!PHASES.has(candidate.phase as ChatProgressPhase)) {
    return null
  }

  return {
    phase: candidate.phase as ChatProgressPhase,
    ...(isCount(candidate.searches) ? { searches: candidate.searches } : {}),
    ...(isText(candidate.title) ? { title: candidate.title } : {}),
    ...(isText(candidate.format) ? { format: candidate.format } : {}),
  }
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * The steps so far, with the new one added.
 *
 * A phase reported again is the same step told in more detail -- a search that
 * now knows how many queries it will run -- so it replaces the last step
 * instead of stacking a near-duplicate line under it.
 */
export function appendProgress(
  steps: readonly ChatProgressEvent[],
  event: ChatProgressEvent,
): ChatProgressEvent[] {
  if (steps.at(-1)?.phase === event.phase) {
    return [...steps.slice(0, -1), event]
  }

  return [...steps, event]
}

/** What to tell the user about a step, as a message key and its numbers. */
export function describeProgress(
  event: ChatProgressEvent,
): ProgressDescription {
  switch (event.phase) {
    case 'searching':
      return event.searches
        ? { key: 'progress.searchingCount', values: { count: event.searches } }
        : { key: 'progress.searching' }
    case 'refining':
      return event.searches
        ? { key: 'progress.refiningCount', values: { count: event.searches } }
        : { key: 'progress.refining' }
    case 'expanding':
      return event.title
        ? { key: 'progress.expandingTitle', values: { title: event.title } }
        : { key: 'progress.expanding' }
    case 'writing_document':
      return event.format
        ? {
            key: 'progress.writingDocumentFormat',
            values: { format: event.format.toUpperCase() },
          }
        : { key: 'progress.writingDocument' }
    default:
      return { key: `progress.${event.phase}` }
  }
}
