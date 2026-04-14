// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatPage } from './chat-page'

type ConversationRenderState = {
  pendingContent: string | null
  persistedUserContents: string[]
}

let conversationRenderStates: ConversationRenderState[] = []

vi.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@logto/react', () => ({
  useLogto: () => ({
    getAccessToken: vi.fn().mockResolvedValue('token'),
  }),
}))

vi.mock('@/components/error-state', () => ({
  ErrorState: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('./chat-shell', () => ({
  ChatShell: ({
    children,
    sidebar,
    headerActions,
  }: {
    children: React.ReactNode
    sidebar: React.ReactNode
    headerActions: React.ReactNode
  }) => (
    <div>
      {sidebar}
      {headerActions}
      {children}
    </div>
  ),
}))

vi.mock('./chat-sidebar', () => ({
  ChatSidebar: () => null,
}))

vi.mock('./sources-panel', () => ({
  SourcesPanel: () => null,
}))

vi.mock('./conversation-view', () => ({
  ConversationView: (props: {
    chat?: { messages?: Array<{ content: string; id: string; role: string }> }
    composerValue: string
    onComposerChange: (value: string) => void
    onSendMessage: () => void
    pendingMessage?: { content: string; id: string }
  }) => {
    const messages = [
      ...(props.chat?.messages ?? []),
      ...(props.pendingMessage ? [props.pendingMessage] : []),
    ]

    conversationRenderStates.push({
      pendingContent: props.pendingMessage?.content ?? null,
      persistedUserContents: (props.chat?.messages ?? [])
        .filter((message) => message.role === 'user')
        .map((message) => message.content),
    })

    return (
      <div>
        <input
          aria-label="composer"
          value={props.composerValue}
          onChange={(event) => props.onComposerChange(event.target.value)}
        />
        <button onClick={props.onSendMessage}>send</button>
        <div data-testid="message-count">{messages.length}</div>
        {messages.map((message) => (
          <div key={message.id}>{message.content}</div>
        ))}
      </div>
    )
  },
}))

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

describe('ChatPage', () => {
  beforeEach(() => {
    conversationRenderStates = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render the pending user message alongside the persisted one', async () => {
    const sendResponse = createDeferred<Response>()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const method = init?.method ?? 'GET'

        if (requestUrl.endsWith('/authenticated-sources')) {
          return jsonResponse({ can_chat: true, connected_sources: [] })
        }

        if (requestUrl.endsWith('/chats') && method === 'GET') {
          return jsonResponse([])
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse({
            created_at: '2026-04-14T18:30:00.000Z',
            id: 'chat-1',
            last_message_preview: null,
            messages: [],
            title: 'Chat empresarial',
            updated_at: '2026-04-14T18:30:00.000Z',
          })
        }

        if (
          requestUrl.endsWith('/chats/chat-1/messages') &&
          method === 'POST'
        ) {
          return sendResponse.promise
        }

        throw new Error(`Unexpected request: ${method} ${requestUrl}`)
      }),
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ChatPage
          onSelectChat={() => undefined}
          selectedChatId="chat-1"
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await screen.findByLabelText('composer')

    fireEvent.change(screen.getByLabelText('composer'), {
      target: { value: 'dime como pedir vacaciones' },
    })
    fireEvent.click(screen.getByText('send'))

    await waitFor(() => {
      expect(screen.getAllByText('dime como pedir vacaciones')).toHaveLength(1)
    })

    sendResponse.resolve(
      jsonResponse({
        assistant_message: {
          chat_id: 'chat-1',
          content: 'Consulta el portal interno de RRHH.',
          created_at: '2026-04-14T18:31:02.000Z',
          id: 'assistant-1',
          metadata: null,
          role: 'assistant',
          status: null,
        },
        chat: {
          created_at: '2026-04-14T18:30:00.000Z',
          id: 'chat-1',
          last_message_preview: 'Consulta el portal interno de RRHH.',
          messages: [
            {
              chat_id: 'chat-1',
              content: 'dime como pedir vacaciones',
              created_at: '2026-04-14T18:31:00.000Z',
              id: 'user-1',
              metadata: null,
              role: 'user',
              status: null,
            },
            {
              chat_id: 'chat-1',
              content: 'Consulta el portal interno de RRHH.',
              created_at: '2026-04-14T18:31:02.000Z',
              id: 'assistant-1',
              metadata: null,
              role: 'assistant',
              status: null,
            },
          ],
          title: 'Chat empresarial',
          updated_at: '2026-04-14T18:31:02.000Z',
        },
        detected_lang: 'es',
        user_message: {
          chat_id: 'chat-1',
          content: 'dime como pedir vacaciones',
          created_at: '2026-04-14T18:31:00.000Z',
          id: 'user-1',
          metadata: null,
          role: 'user',
          status: null,
        },
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('message-count').textContent).toBe('2')
    })

    expect(
      conversationRenderStates.some(
        (state) =>
          state.pendingContent === 'dime como pedir vacaciones' &&
          state.persistedUserContents.includes('dime como pedir vacaciones'),
      ),
    ).toBe(false)
  })
})
