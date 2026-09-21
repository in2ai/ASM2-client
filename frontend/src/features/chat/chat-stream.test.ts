import { describe, expect, it, vi } from 'vite-plus/test'
import { readChatTurn, UnfinishedTurnError } from './chat-stream'

function turnResponse(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  })
}

const RESULT = {
  assistant_message: { content: 'You have 23 days.' },
  chat: { id: 'chat-1' },
  detected_lang: 'en',
  user_message: { content: 'How many holidays?' },
}

describe('readChatTurn', () => {
  it('reports every step and returns the finished answer', async () => {
    const onProgress = vi.fn()
    const turn = await readChatTurn(
      turnResponse(
        'event: progress\ndata: {"phase":"understanding"}\n\n' +
          'event: progress\ndata: {"phase":"searching","searches":3}\n\n' +
          `event: result\ndata: ${JSON.stringify(RESULT)}\n\n`,
      ),
      onProgress,
    )

    expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
      { phase: 'understanding' },
      { phase: 'searching', searches: 3 },
    ])
    expect(turn).toEqual(RESULT)
  })

  it('skips progress it cannot make sense of', async () => {
    const onProgress = vi.fn()

    await readChatTurn(
      turnResponse(
        'event: progress\ndata: {"phase":"levitating"}\n\n' +
          'event: progress\ndata: not json\n\n' +
          `event: result\ndata: ${JSON.stringify(RESULT)}\n\n`,
      ),
      onProgress,
    )

    expect(onProgress).not.toHaveBeenCalled()
  })

  it('raises the failure the backend reported', async () => {
    await expect(
      readChatTurn(
        turnResponse(
          'event: progress\ndata: {"phase":"thinking"}\n\n' +
            'event: error\ndata: {"detail":"Chat is unavailable"}\n\n',
        ),
      ),
    ).rejects.toThrow('Chat is unavailable')
  })

  it('raises an unfinished turn when the stream ends without an answer', async () => {
    await expect(
      readChatTurn(
        turnResponse('event: progress\ndata: {"phase":"reading"}\n\n'),
      ),
    ).rejects.toBeInstanceOf(UnfinishedTurnError)
  })
})
