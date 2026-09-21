/**
 * Reading a `text/event-stream` response.
 *
 * Only what the chat needs: named events carrying one JSON payload each,
 * as the backend writes them.
 */

export interface ServerSentEvent {
  name: string
  data: string
}

/** The events in one block of stream text, and the unfinished tail after them. */
export function splitEventStream(text: string): {
  events: ServerSentEvent[]
  rest: string
} {
  const blocks = text.split('\n\n')
  const rest = blocks.pop() ?? ''
  const events: ServerSentEvent[] = []

  for (const block of blocks) {
    const event = parseEventBlock(block)

    if (event) {
      events.push(event)
    }
  }

  return { events, rest }
}

function parseEventBlock(block: string): ServerSentEvent | null {
  let name = 'message'
  const data: string[] = []

  for (const line of block.split('\n')) {
    // A line starting with a colon is a comment, such as the keep-alive sent
    // to hold a quiet connection open.
    if (!line.trim() || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      name = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trim())
    }
  }

  return data.length > 0 ? { name, data: data.join('\n') } : null
}

/** Every event of a streamed response, as it arrives. */
export async function* readEventStream(
  response: Response,
): AsyncGenerator<ServerSentEvent> {
  const reader = response.body?.getReader()

  if (!reader) {
    // Nothing to follow along with, so take the body in one piece instead.
    const { events } = splitEventStream(`${await response.text()}\n\n`)
    yield* events
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const { events, rest } = splitEventStream(buffer)
      buffer = rest

      yield* events
    }

    const { events } = splitEventStream(`${buffer}\n\n`)
    yield* events
  } finally {
    reader.releaseLock()
  }
}
