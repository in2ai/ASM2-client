// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatPage } from './chat-page'

type ConversationRenderState = {
  isSending: boolean
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
  ChatSidebar: (props: {
    chats: Array<{ id: string; title: string }>
    onDeleteChat: (chatId: string) => void
  }) => (
    <div>
      {props.chats.map((chat) => (
        <button key={chat.id} onClick={() => props.onDeleteChat(chat.id)}>
          {`delete-${chat.id}`}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('./sources-panel', () => ({
  SourcesPanel: () => null,
}))

vi.mock('./conversation-view', () => ({
  ConversationView: (props: {
    chat?: { messages?: Array<{ content: string; id: string; role: string }> }
    composerDisabled?: boolean
    composerValue: string
    isSending?: boolean
    onComposerChange: (value: string) => void
    onSendMessage: () => void
    pendingMessage?: { content: string; id: string }
  }) => {
    const messages = [
      ...(props.chat?.messages ?? []),
      ...(props.pendingMessage ? [props.pendingMessage] : []),
    ]

    conversationRenderStates.push({
      isSending: props.isSending ?? false,
      pendingContent: props.pendingMessage?.content ?? null,
      persistedUserContents: (props.chat?.messages ?? [])
        .filter((message) => message.role === 'user')
        .map((message) => message.content),
    })

    return (
      <div>
        <input
          aria-label="composer"
          disabled={props.composerDisabled}
          value={props.composerValue}
          onChange={(event) => props.onComposerChange(event.target.value)}
        />
        <button onClick={props.onSendMessage}>send</button>
        {props.isSending ? <div>sending-indicator</div> : null}
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
    cleanup()
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

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse({
            can_chat: true,
            connected_sources: [],
            selected_sources: [],
          })
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

  it('keeps the pending user message scoped to the originating chat', async () => {
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

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse({
            can_chat: true,
            connected_sources: [],
            selected_sources: [],
          })
        }

        if (requestUrl.endsWith('/chats') && method === 'GET') {
          return jsonResponse([
            {
              created_at: '2026-04-14T18:30:00.000Z',
              id: 'chat-1',
              last_message_preview: null,
              title: 'Chat empresarial',
              updated_at: '2026-04-14T18:30:00.000Z',
            },
            {
              created_at: '2026-04-14T18:20:00.000Z',
              id: 'chat-2',
              last_message_preview: null,
              title: 'Chat de soporte',
              updated_at: '2026-04-14T18:20:00.000Z',
            },
          ])
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

        if (requestUrl.endsWith('/chats/chat-2') && method === 'GET') {
          return jsonResponse({
            created_at: '2026-04-14T18:20:00.000Z',
            id: 'chat-2',
            last_message_preview: null,
            messages: [],
            title: 'Chat de soporte',
            updated_at: '2026-04-14T18:20:00.000Z',
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

    const { rerender } = render(
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
      target: { value: 'mensaje en curso' },
    })
    fireEvent.click(screen.getByText('send'))

    await waitFor(() => {
      expect(screen.getAllByText('mensaje en curso')).toHaveLength(1)
    })
    expect(screen.getByText('sending-indicator')).toBeTruthy()

    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatPage
          onSelectChat={() => undefined}
          selectedChatId="chat-2"
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByText('mensaje en curso')).toBeNull()
    })
    expect(screen.queryByText('sending-indicator')).toBeNull()
    expect(conversationRenderStates.at(-1)?.isSending).toBe(false)

    sendResponse.resolve(
      jsonResponse({
        assistant_message: {
          chat_id: 'chat-1',
          content: 'respuesta final',
          created_at: '2026-04-14T18:31:02.000Z',
          id: 'assistant-1',
          metadata: null,
          role: 'assistant',
          status: null,
        },
        chat: {
          created_at: '2026-04-14T18:30:00.000Z',
          id: 'chat-1',
          last_message_preview: 'respuesta final',
          messages: [
            {
              chat_id: 'chat-1',
              content: 'mensaje en curso',
              created_at: '2026-04-14T18:31:00.000Z',
              id: 'user-1',
              metadata: null,
              role: 'user',
              status: null,
            },
            {
              chat_id: 'chat-1',
              content: 'respuesta final',
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
          content: 'mensaje en curso',
          created_at: '2026-04-14T18:31:00.000Z',
          id: 'user-1',
          metadata: null,
          role: 'user',
          status: null,
        },
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText('mensaje en curso')).toBeNull()
    })
  })

  it('hides the optimistic bubble once the chat query contains the persisted user message', async () => {
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

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse({
            can_chat: true,
            connected_sources: [],
            selected_sources: [],
          })
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
      target: { value: 'mensaje duplicado' },
    })
    fireEvent.click(screen.getByText('send'))

    await waitFor(() => {
      expect(screen.getAllByText('mensaje duplicado')).toHaveLength(1)
    })

    act(() => {
      queryClient.setQueryData(['chat', 'detail', 'chat-1'], {
        created_at: '2026-04-14T18:30:00.000Z',
        id: 'chat-1',
        last_message_preview: 'mensaje duplicado',
        messages: [
          {
            chat_id: 'chat-1',
            content: 'mensaje duplicado',
            created_at: '2026-04-14T18:30:59.000Z',
            id: 'user-1',
            metadata: null,
            role: 'user',
            status: null,
          },
        ],
        title: 'Chat empresarial',
        updated_at: '2026-04-14T18:31:01.000Z',
      })
    })

    await waitFor(() => {
      expect(screen.getAllByText('mensaje duplicado')).toHaveLength(1)
      expect(screen.getByTestId('message-count').textContent).toBe('1')
    })

    sendResponse.resolve(
      jsonResponse({
        assistant_message: {
          chat_id: 'chat-1',
          content: 'respuesta final',
          created_at: '2026-04-14T18:31:02.000Z',
          id: 'assistant-1',
          metadata: null,
          role: 'assistant',
          status: null,
        },
        chat: {
          created_at: '2026-04-14T18:30:00.000Z',
          id: 'chat-1',
          last_message_preview: 'respuesta final',
          messages: [
            {
              chat_id: 'chat-1',
              content: 'mensaje duplicado',
              created_at: '2026-04-14T18:31:01.000Z',
              id: 'user-1',
              metadata: null,
              role: 'user',
              status: null,
            },
            {
              chat_id: 'chat-1',
              content: 'respuesta final',
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
          content: 'mensaje duplicado',
          created_at: '2026-04-14T18:31:01.000Z',
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
  })

  it('keeps chat enabled for admins while VDB indexing is active', async () => {
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

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse({
            can_chat: true,
            connected_sources: ['drive'],
            selected_sources: ['drive'],
          })
        }

        if (requestUrl.endsWith('/vdb-update-status')) {
          return jsonResponse({ active: true })
        }

        if (requestUrl.endsWith('/chats') && method === 'GET') {
          return jsonResponse([])
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
          user={{ role: 'admin', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText('composer') as HTMLInputElement).disabled,
      ).toBe(false)
    })
  })

  it('selects the next chat after deleting the active conversation', async () => {
    let chats = [
      {
        created_at: '2026-04-14T18:30:00.000Z',
        id: 'chat-1',
        last_message_preview: 'Mensaje 1',
        title: 'Chat empresarial',
        updated_at: '2026-04-14T18:32:00.000Z',
      },
      {
        created_at: '2026-04-14T18:20:00.000Z',
        id: 'chat-2',
        last_message_preview: 'Mensaje 2',
        title: 'Chat de soporte',
        updated_at: '2026-04-14T18:21:00.000Z',
      },
    ]

    const onSelectChat = vi.fn()

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

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse({
            can_chat: true,
            connected_sources: [],
            selected_sources: [],
          })
        }

        if (requestUrl.endsWith('/chats') && method === 'GET') {
          return jsonResponse(chats)
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse({
            ...chats[0],
            messages: [],
          })
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'DELETE') {
          chats = chats.filter((chat) => chat.id !== 'chat-1')
          return new Response(null, { status: 204 })
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
          onSelectChat={onSelectChat}
          selectedChatId="chat-1"
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await screen.findByText('delete-chat-1')

    fireEvent.click(screen.getByText('delete-chat-1'))

    await waitFor(() => {
      expect(onSelectChat).toHaveBeenCalledWith('chat-2', { replace: true })
    })
  })
})
