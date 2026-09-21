import { describe, expect, it } from 'vite-plus/test'
import { readEventStream, splitEventStream } from './event-stream'

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

async function collect(response: Response) {
  const events = []

  for await (const event of readEventStream(response)) {
    events.push(event)
  }

  return events
}

describe('splitEventStream', () => {
  it('returns whole events and holds back the unfinished tail', () => {
    const { events, rest } = splitEventStream(
      'event: progress\ndata: {"phase":"thinking"}\n\nevent: result\ndata: {"a"',
    )

    expect(events).toEqual([{ name: 'progress', data: '{"phase":"thinking"}' }])
    expect(rest).toBe('event: result\ndata: {"a"')
  })

  it('skips keep-alive comments', () => {
    const { events } = splitEventStream(': keep-alive\n\n: keep-alive\n\n')

    expect(events).toEqual([])
  })

  it('names an event without an event line the default way', () => {
    const { events } = splitEventStream('data: hello\n\n')

    expect(events).toEqual([{ name: 'message', data: 'hello' }])
  })
})

describe('readEventStream', () => {
  it('reads events that arrive split across chunks', async () => {
    const response = new Response(
      streamOf(
        'event: progress\ndata: {"phase":"sear',
        'ching"}\n\n: keep-alive\n\nevent: result\ndata: {"ok":true}\n\n',
      ),
    )

    expect(await collect(response)).toEqual([
      { name: 'progress', data: '{"phase":"searching"}' },
      { name: 'result', data: '{"ok":true}' },
    ])
  })

  it('reads a last event left without its blank line', async () => {
    const response = new Response(streamOf('event: result\ndata: {"ok":true}'))

    expect(await collect(response)).toEqual([
      { name: 'result', data: '{"ok":true}' },
    ])
  })

  it('falls back to the whole body when the response cannot be streamed', async () => {
    const response = {
      body: null,
      text: async () => 'event: result\ndata: {"ok":true}\n\n',
    } as Response

    expect(await collect(response)).toEqual([
      { name: 'result', data: '{"ok":true}' },
    ])
  })
})
