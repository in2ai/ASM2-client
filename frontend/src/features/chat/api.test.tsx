// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useAuthorizedChatDownload, useAuthorizedChatRequest } from './api'

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
}))

vi.mock('@logto/react', () => ({
  useLogto: () => ({
    getAccessToken: mocks.getAccessToken,
  }),
}))

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

describe('useAuthorizedChatRequest', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue('chat-token')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends authenticated JSON requests to the backend', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthorizedChatRequest())

    await expect(
      result.current('/chats/chat-1/messages', {
        body: JSON.stringify({ content: 'hello' }),
        method: 'POST',
      }),
    ).resolves.toEqual({ ok: true })

    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const headers = init.headers as Headers

    expect(requestUrl).toMatch(/\/chats\/chat-1\/messages$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ content: 'hello' }))
    expect(headers.get('Authorization')).toBe('Bearer chat-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('rejects before fetch when no access token is available', async () => {
    const fetchMock = vi.fn()
    mocks.getAccessToken.mockResolvedValue(null)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthorizedChatRequest())

    await expect(result.current('/chats')).rejects.toThrow(
      'Missing access token',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses backend detail messages for failed requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'Chat not found' }, 404)),
    )

    const { result } = renderHook(() => useAuthorizedChatRequest())

    await expect(result.current('/chats/missing')).rejects.toThrow(
      'Chat not found',
    )
  })

  it('handles empty successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )

    const { result } = renderHook(() => useAuthorizedChatRequest())

    await expect(
      result.current('/chats/chat-1', { method: 'DELETE' }),
    ).resolves.toBeUndefined()
  })
})

describe('useAuthorizedChatDownload', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue('chat-token')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('requests the document as a blob with the access token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('%PDF-1.7', {
          headers: { 'Content-Type': 'application/pdf' },
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthorizedChatDownload())
    const blob = await result.current(
      '/chats/chat-1/messages/message-1/document',
    )

    const [requestUrl, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]

    expect(requestUrl).toMatch(
      /\/chats\/chat-1\/messages\/message-1\/document$/,
    )
    const headers = new Headers(init.headers)

    expect(headers.get('Authorization')).toBe('Bearer chat-token')
    expect(headers.get('Content-Type')).toBeNull()
    expect(await blob.text()).toBe('%PDF-1.7')
  })

  it('uses backend detail messages for failed downloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ detail: 'This message has no generated document' }, 404),
      ),
    )

    const { result } = renderHook(() => useAuthorizedChatDownload())

    await expect(
      result.current('/chats/chat-1/messages/message-1/document'),
    ).rejects.toThrow('This message has no generated document')
  })

  it('rejects before fetch when no access token is available', async () => {
    const fetchMock = vi.fn()
    mocks.getAccessToken.mockResolvedValue(null)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthorizedChatDownload())

    await expect(
      result.current('/chats/chat-1/messages/message-1/document'),
    ).rejects.toThrow('Missing access token')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
