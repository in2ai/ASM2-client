import { readEventStream } from './event-stream'
import { parseProgressEvent } from './chat-progress'
import type { ChatProgressEvent, SendMessageResult } from './types'

/**
 * The stream ended before the answer did.
 *
 * Carries no message of its own: the caller says so in the user's language.
 */
export class UnfinishedTurnError extends Error {
  constructor() {
    super('')
    this.name = 'UnfinishedTurnError'
  }
}

/**
 * Follows a chat turn from start to finished answer.
 *
 * The answer itself is not streamed -- it arrives whole, in the last event.
 * What comes before it is the backend saying what it is doing, which
 * `onProgress` passes on to the conversation while the user waits.
 */
export async function readChatTurn(
  response: Response,
  onProgress?: (event: ChatProgressEvent) => void,
): Promise<SendMessageResult> {
  let turn: SendMessageResult | undefined

  for await (const { name, data } of readEventStream(response)) {
    const payload = parseJson(data)

    if (name === 'progress') {
      const progress = parseProgressEvent(payload)

      if (progress) {
        onProgress?.(progress)
      }

      continue
    }

    if (name === 'result') {
      turn = payload as SendMessageResult
      continue
    }

    if (name === 'error') {
      throw new Error(readDetail(payload))
    }
  }

  if (!turn) {
    throw new UnfinishedTurnError()
  }

  return turn
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function readDetail(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'detail' in payload &&
    typeof payload.detail === 'string'
  ) {
    return payload.detail
  }

  return ''
}
