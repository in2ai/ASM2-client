import { describe, expect, it } from 'vite-plus/test'
import {
  appendProgress,
  describeProgress,
  parseProgressEvent,
} from './chat-progress'
import type { ChatProgressEvent } from './types'

describe('parseProgressEvent', () => {
  it('keeps a known phase with its numbers', () => {
    expect(parseProgressEvent({ phase: 'searching', searches: 3 })).toEqual({
      phase: 'searching',
      searches: 3,
    })
  })

  it('drops a phase this version does not know', () => {
    expect(parseProgressEvent({ phase: 'daydreaming' })).toBeNull()
  })

  it('drops payloads that are not progress at all', () => {
    expect(parseProgressEvent(null)).toBeNull()
    expect(parseProgressEvent('searching')).toBeNull()
    expect(parseProgressEvent({})).toBeNull()
  })

  it('ignores fields that do not hold what they should', () => {
    expect(
      parseProgressEvent({
        phase: 'searching',
        searches: '3',
        title: '   ',
      }),
    ).toEqual({ phase: 'searching' })
  })
})

describe('appendProgress', () => {
  it('adds a step of its own for a new phase', () => {
    const steps = appendProgress([{ phase: 'thinking' }], {
      phase: 'searching',
    })

    expect(steps).toEqual([{ phase: 'thinking' }, { phase: 'searching' }])
  })

  it('lets a repeated phase refine the step already there', () => {
    const steps = appendProgress([{ phase: 'searching' }], {
      phase: 'searching',
      searches: 3,
    })

    expect(steps).toEqual([{ phase: 'searching', searches: 3 }])
  })
})

describe('describeProgress', () => {
  const cases: Array<[ChatProgressEvent, string]> = [
    [{ phase: 'understanding' }, 'progress.understanding'],
    [{ phase: 'searching' }, 'progress.searching'],
    [{ phase: 'searching', searches: 3 }, 'progress.searchingCount'],
    [{ phase: 'reading' }, 'progress.reading'],
    [{ phase: 'expanding' }, 'progress.expanding'],
    [{ phase: 'expanding', title: 'Handbook' }, 'progress.expandingTitle'],
    [{ phase: 'refining', searches: 2 }, 'progress.refiningCount'],
    [{ phase: 'writing_document' }, 'progress.writingDocument'],
    [
      { phase: 'writing_document', format: 'pdf' },
      'progress.writingDocumentFormat',
    ],
    [{ phase: 'composing' }, 'progress.composing'],
    [{ phase: 'summarizing' }, 'progress.summarizing'],
  ]

  it.each(cases)('describes %o with its own message', (event, key) => {
    expect(describeProgress(event).key).toBe(key)
  })

  it('passes the numbers the message needs', () => {
    expect(
      describeProgress({ phase: 'searching', searches: 3 }).values,
    ).toEqual({ count: 3 })
    expect(
      describeProgress({ phase: 'writing_document', format: 'pdf' }).values,
    ).toEqual({ format: 'PDF' })
  })
})
