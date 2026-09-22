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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { ChatPage } from './chat-page'

type ConversationRenderState = {
  composerDisabled?: boolean
  composerHint?: string
  emptyDescription?: string
  emptyTitle?: string
  isSending: boolean
  pendingContent: string | null
  persistedUserContents: string[]
  progressSteps: string[]
  progressStartedAt?: number
  composerValue: string
  errorMessage?: string
}

let conversationRenderStates: ConversationRenderState[] = []

/** The sidebar listing, whichever archive side it asks for. */
function isChatsListRequest(requestUrl: string, method: string) {
  return method === 'GET' && /\/chats\?archived=(true|false)$/.test(requestUrl)
}

function isArchivedListRequest(requestUrl: string) {
  return requestUrl.endsWith('/chats?archived=true')
}

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
    chats: Array<{
      archived?: boolean
      id: string
      pinned?: boolean
      title: string
    }>
    onDeleteChat: (chatId: string) => void
    onRenameChat: (chatId: string, title: string) => void
    onSetChatArchived: (chatId: string, archived: boolean) => void
    onSetChatPinned: (chatId: string, pinned: boolean) => void
    onShowArchivedChange: (showArchived: boolean) => void
    showArchived: boolean
  }) => (
    <div>
      <span>{`showArchived-${props.showArchived}`}</span>
      <button onClick={() => props.onShowArchivedChange(!props.showArchived)}>
        toggle-archived-view
      </button>
      {props.chats.map((chat) => (
        <div key={chat.id}>
          <button onClick={() => props.onDeleteChat(chat.id)}>
            {`delete-${chat.id}`}
          </button>
          <button onClick={() => props.onRenameChat(chat.id, 'Vacaciones')}>
            {`rename-${chat.id}`}
          </button>
          <button onClick={() => props.onSetChatPinned(chat.id, !chat.pinned)}>
            {`pin-${chat.id}`}
          </button>
          <button
            onClick={() => props.onSetChatArchived(chat.id, !chat.archived)}
          >
            {`archive-${chat.id}`}
          </button>
          <span>{`title-${chat.id}-${chat.title}`}</span>
        </div>
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
    composerHint?: string
    composerValue: string
    emptyDescription?: string
    emptyTitle?: string
    errorMessage?: string
    isSending?: boolean
    onComposerChange: (value: string) => void
    onSendMessage: () => void
    pendingMessage?: { content: string; id: string }
    progress?: {
      events: readonly { phase: string }[]
      formatStep: (event: { phase: string }) => string
      startedAt?: number
    }
  }) => {
    const messages = [
      ...(props.chat?.messages ?? []),
      ...(props.pendingMessage ? [props.pendingMessage] : []),
    ]

    conversationRenderStates.push({
      composerDisabled: props.composerDisabled,
      composerHint: props.composerHint,
      emptyDescription: props.emptyDescription,
      emptyTitle: props.emptyTitle,
      isSending: props.isSending ?? false,
      pendingContent: props.pendingMessage?.content ?? null,
      persistedUserContents: (props.chat?.messages ?? [])
        .filter((message) => message.role === 'user')
        .map((message) => message.content),
      composerValue: props.composerValue,
      errorMessage: props.errorMessage,
      progressStartedAt: props.progress?.startedAt,
      progressSteps: (props.progress?.events ?? []).map((event) =>
        props.progress!.formatStep(event),
      ),
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
        <div data-testid="composer-error">{props.errorMessage ?? ''}</div>
        <div data-testid="progress-steps">
          {(props.progress?.events ?? [])
            .map((event) => props.progress!.formatStep(event))
            .join('|')}
        </div>
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

/** A turn the test drives step by step, as the backend would stream it. */
function controllableTurn() {
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
  })

  const send = (name: string, payload: unknown) =>
    controller.enqueue(
      encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`),
    )

  return {
    response: new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 200,
    }),
    reportProgress: (phase: string) => send('progress', { phase }),
    finish: (payload: unknown) => {
      send('result', payload)
      controller.close()
    },
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

/** A finished turn, as the streaming endpoint reports one. */
function turnResponse(payload: unknown) {
  return new Response(
    `event: progress\ndata: {"phase": "thinking"}\n\n` +
      `event: result\ndata: ${JSON.stringify(payload)}\n\n`,
    {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 200,
    },
  )
}

/** Sources + VDB state that allows sending chat messages (matches backend contract). */
const sourcesStatusChatReady = {
  can_chat: true,
  vdb_indexing_active: false,
  connected_sources: ['drive'],
  selected_sources: ['drive'],
}

const sourcesStatusChatReadyWhileIndexing = {
  can_chat: true,
  vdb_indexing_active: true,
  connected_sources: ['drive'],
  selected_sources: ['drive'],
}

const sourcesStatusSetupInProgress = {
  can_chat: false,
  vdb_indexing_active: true,
  connected_sources: ['drive'],
  selected_sources: ['drive'],
}

const sourcesStatusAwaitingFirstBuild = {
  can_chat: false,
  vdb_indexing_active: false,
  connected_sources: ['drive'],
  selected_sources: ['drive'],
}

describe('ChatPage', () => {
  beforeEach(() => {
    conversationRenderStates = []
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
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
          requestUrl.endsWith('/chats/chat-1/messages/stream') &&
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
      turnResponse({
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

  it('keeps a running turn visible when another conversation is asked something', async () => {
    // Reported from the app: ask in one conversation, start a second one and
    // ask there, and the first conversation lost its progress panel until the
    // answer landed. The turn state used to be one global slot.
    const firstTurn = controllableTurn()
    const secondTurn = controllableTurn()

    const chatOf = (id: string, title: string) => ({
      created_at: '2026-04-14T18:30:00.000Z',
      id,
      last_message_preview: null,
      messages: [],
      title,
      updated_at: '2026-04-14T18:30:00.000Z',
    })

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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse(
            isArchivedListRequest(requestUrl)
              ? []
              : [chatOf('chat-1', 'ASM2'), chatOf('chat-2', 'IN2AI')],
          )
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse(chatOf('chat-1', 'ASM2'))
        }

        if (requestUrl.endsWith('/chats/chat-2') && method === 'GET') {
          return jsonResponse(chatOf('chat-2', 'IN2AI'))
        }

        if (requestUrl.endsWith('/chats/chat-1/messages/stream')) {
          return firstTurn.response
        }

        if (requestUrl.endsWith('/chats/chat-2/messages/stream')) {
          return secondTurn.response
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

    const view = render(
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
      target: { value: 'Dime de que va ASM2' },
    })
    fireEvent.click(screen.getByText('send'))

    await act(async () => {
      firstTurn.reportProgress('searching')
    })

    await waitFor(() => {
      expect(screen.getByTestId('progress-steps').textContent).toBe(
        'progress.searching',
      )
    })

    // Move to the other conversation and ask there while the first still runs.
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatPage
          onSelectChat={() => undefined}
          selectedChatId="chat-2"
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('progress-steps').textContent).toBe('')
    })

    fireEvent.change(screen.getByLabelText('composer'), {
      target: { value: 'Dime quien compone IN2AI' },
    })
    fireEvent.click(screen.getByText('send'))

    await act(async () => {
      secondTurn.reportProgress('reading')
    })

    await waitFor(() => {
      expect(screen.getByTestId('progress-steps').textContent).toBe(
        'progress.reading',
      )
    })

    // Back to the first conversation: its own turn is still running, still
    // showing its own steps rather than the other conversation's.
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ChatPage
          onSelectChat={() => undefined}
          selectedChatId="chat-1"
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('sending-indicator')).toBeTruthy()
    })

    expect(screen.getByTestId('progress-steps').textContent).toBe(
      'progress.searching',
    )
    expect(screen.getAllByText('Dime de que va ASM2').length).toBeGreaterThan(0)

    const latest = conversationRenderStates.at(-1)
    expect(latest?.isSending).toBe(true)
    expect(typeof latest?.progressStartedAt).toBe('number')
  })

  it('keeps each conversation composer and errors to itself', async () => {
    const firstTurn = createDeferred<Response>()

    const chatOf = (id: string, title: string) => ({
      created_at: '2026-04-14T18:30:00.000Z',
      id,
      last_message_preview: null,
      messages: [],
      title,
      updated_at: '2026-04-14T18:30:00.000Z',
    })

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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse(
            isArchivedListRequest(requestUrl)
              ? []
              : [chatOf('chat-1', 'ASM2'), chatOf('chat-2', 'IN2AI')],
          )
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse(chatOf('chat-1', 'ASM2'))
        }

        if (requestUrl.endsWith('/chats/chat-2') && method === 'GET') {
          return jsonResponse(chatOf('chat-2', 'IN2AI'))
        }

        if (requestUrl.endsWith('/chats/chat-1/messages/stream')) {
          return firstTurn.promise
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

    const show = (chatId: string) => (
      <QueryClientProvider client={queryClient}>
        <ChatPage
          onSelectChat={() => undefined}
          selectedChatId={chatId}
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>
    )

    const view = render(show('chat-1'))

    await screen.findByLabelText('composer')

    fireEvent.change(screen.getByLabelText('composer'), {
      target: { value: 'Dime de que va ASM2' },
    })
    fireEvent.click(screen.getByText('send'))

    // Move over and start typing while the first conversation is still working.
    view.rerender(show('chat-2'))

    await waitFor(() => {
      expect(
        (screen.getByLabelText('composer') as HTMLInputElement).value,
      ).toBe('')
    })

    fireEvent.change(screen.getByLabelText('composer'), {
      target: { value: 'Dime quien compone IN2AI' },
    })

    // The first conversation's turn now fails.
    firstTurn.resolve(
      new Response(JSON.stringify({ detail: 'boom' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }),
    )

    await waitFor(() => {
      expect(
        conversationRenderStates.some((state) => state.isSending === false),
      ).toBe(true)
    })

    // The draft being typed here is untouched, and the failure is not reported
    // under this conversation.
    expect((screen.getByLabelText('composer') as HTMLInputElement).value).toBe(
      'Dime quien compone IN2AI',
    )
    expect(screen.getByTestId('composer-error').textContent).toBe('')

    // The failure and the text that caused it belong to the conversation asked.
    view.rerender(show('chat-1'))

    await waitFor(() => {
      expect(
        (screen.getByLabelText('composer') as HTMLInputElement).value,
      ).toBe('Dime de que va ASM2')
    })

    expect(screen.getByTestId('composer-error').textContent).not.toBe('')
  })

  it('keeps an unsent draft with the conversation it was typed in', async () => {
    const chatOf = (id: string, title: string) => ({
      created_at: '2026-04-14T18:30:00.000Z',
      id,
      last_message_preview: null,
      messages: [],
      title,
      updated_at: '2026-04-14T18:30:00.000Z',
    })

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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse(
            isArchivedListRequest(requestUrl)
              ? []
              : [chatOf('chat-1', 'ASM2'), chatOf('chat-2', 'IN2AI')],
          )
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse(chatOf('chat-1', 'ASM2'))
        }

        if (requestUrl.endsWith('/chats/chat-2') && method === 'GET') {
          return jsonResponse(chatOf('chat-2', 'IN2AI'))
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

    const show = (chatId: string) => (
      <QueryClientProvider client={queryClient}>
        <ChatPage
          onSelectChat={() => undefined}
          selectedChatId={chatId}
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>
    )

    const view = render(show('chat-1'))

    await screen.findByLabelText('composer')

    fireEvent.change(screen.getByLabelText('composer'), {
      target: { value: 'borrador de ASM2' },
    })

    view.rerender(show('chat-2'))

    await waitFor(() => {
      expect(
        (screen.getByLabelText('composer') as HTMLInputElement).value,
      ).toBe('')
    })

    view.rerender(show('chat-1'))

    await waitFor(() => {
      expect(
        (screen.getByLabelText('composer') as HTMLInputElement).value,
      ).toBe('borrador de ASM2')
    })
  })

  it('refuses a second turn in a conversation already answering', async () => {
    const firstTurn = createDeferred<Response>()
    let streamRequests = 0

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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse([])
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse({
            created_at: '2026-04-14T18:30:00.000Z',
            id: 'chat-1',
            last_message_preview: null,
            messages: [],
            title: 'ASM2',
            updated_at: '2026-04-14T18:30:00.000Z',
          })
        }

        if (requestUrl.endsWith('/chats/chat-1/messages/stream')) {
          streamRequests += 1
          return firstTurn.promise
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
      target: { value: 'primera' },
    })
    fireEvent.click(screen.getByText('send'))

    await waitFor(() => {
      expect(screen.getByText('sending-indicator')).toBeTruthy()
    })

    // The button is disabled meanwhile, but the Enter key reaches the handler
    // directly, so the handler itself has to refuse.
    fireEvent.change(screen.getByLabelText('composer'), {
      target: { value: 'segunda' },
    })
    fireEvent.click(screen.getByText('send'))

    await waitFor(() => {
      expect(streamRequests).toBe(1)
    })

    // The second question is still in the composer, unsent.
    expect((screen.getByLabelText('composer') as HTMLInputElement).value).toBe(
      'segunda',
    )
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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
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
          requestUrl.endsWith('/chats/chat-1/messages/stream') &&
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
      turnResponse({
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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
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
          requestUrl.endsWith('/chats/chat-1/messages/stream') &&
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
      turnResponse({
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

  it('disables chat while the first VDB build is still in progress', async () => {
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
          return jsonResponse(sourcesStatusSetupInProgress)
        }

        if (isChatsListRequest(requestUrl, method)) {
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
        conversationRenderStates.some(
          (state) =>
            state.composerDisabled === true &&
            state.composerHint === 'composer.finishSetupHint' &&
            state.emptyTitle === 'empty.syncTitle' &&
            state.emptyDescription === 'empty.syncDescription',
        ),
      ).toBe(true)
    })
  })

  it('asks to start the first VDB build before chat is enabled', async () => {
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
          return jsonResponse(sourcesStatusAwaitingFirstBuild)
        }

        if (isChatsListRequest(requestUrl, method)) {
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
        conversationRenderStates.some(
          (state) =>
            state.composerDisabled === true &&
            state.composerHint ===
              'composer.disabledHintIndexingInactiveAdmin' &&
            state.emptyTitle === 'empty.indexingInactiveTitle' &&
            state.emptyDescription === 'empty.indexingInactiveDescriptionAdmin',
        ),
      ).toBe(true)
    })
  })

  it('keeps chat enabled while indexing continues after the first build', async () => {
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
          return jsonResponse(sourcesStatusChatReadyWhileIndexing)
        }

        if (isChatsListRequest(requestUrl, method)) {
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

  it('re-enables chat automatically after the initial VDB build finishes', async () => {
    vi.useFakeTimers()

    let statusResponse = sourcesStatusSetupInProgress
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const method = init?.method ?? 'GET'

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse(statusResponse)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse([])
        }

        throw new Error(`Unexpected request: ${method} ${requestUrl}`)
      },
    )

    vi.stubGlobal('fetch', fetchMock)

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

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      (screen.getByLabelText('composer') as HTMLInputElement).disabled,
    ).toBe(true)

    const initialSourcesStatusCalls = fetchMock.mock.calls.filter(([input]) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      return requestUrl.endsWith('/sources/status')
    }).length

    statusResponse = sourcesStatusChatReady

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
      await Promise.resolve()
      await Promise.resolve()
    })

    const updatedSourcesStatusCalls = fetchMock.mock.calls.filter(([input]) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url
      return requestUrl.endsWith('/sources/status')
    }).length

    expect(updatedSourcesStatusCalls).toBeGreaterThan(initialSourcesStatusCalls)

    expect(
      (screen.getByLabelText('composer') as HTMLInputElement).disabled,
    ).toBe(false)
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
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
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

  it('renames a conversation and shows its new title in the sidebar', async () => {
    let chat = {
      created_at: '2026-04-14T18:30:00.000Z',
      id: 'chat-1',
      last_message_preview: 'Mensaje 1',
      title: 'Chat empresarial',
      updated_at: '2026-04-14T18:32:00.000Z',
    }

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const method = init?.method ?? 'GET'

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse([chat])
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse({ ...chat, messages: [] })
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'PATCH') {
          const { title } = JSON.parse(init?.body as string) as {
            title: string
          }
          chat = { ...chat, title }
          return jsonResponse({ ...chat, messages: [] })
        }

        throw new Error(`Unexpected request: ${method} ${requestUrl}`)
      },
    )

    vi.stubGlobal('fetch', fetchMock)

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

    await screen.findByText('title-chat-1-Chat empresarial')

    fireEvent.click(screen.getByText('rename-chat-1'))

    await screen.findByText('title-chat-1-Vacaciones')

    const renameCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    )
    expect(renameCall?.[1]?.body).toBe(JSON.stringify({ title: 'Vacaciones' }))
  })

  it('pins a conversation through the chat endpoint', async () => {
    let chat = {
      archived: false,
      created_at: '2026-04-14T18:30:00.000Z',
      id: 'chat-1',
      last_message_preview: 'Mensaje 1',
      pinned: false,
      title: 'Chat empresarial',
      updated_at: '2026-04-14T18:32:00.000Z',
    }

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const method = init?.method ?? 'GET'

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse(isArchivedListRequest(requestUrl) ? [] : [chat])
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse({ ...chat, messages: [] })
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'PATCH') {
          const { pinned } = JSON.parse(init?.body as string) as {
            pinned: boolean
          }
          chat = { ...chat, pinned }
          return jsonResponse({ ...chat, messages: [] })
        }

        throw new Error(`Unexpected request: ${method} ${requestUrl}`)
      },
    )

    vi.stubGlobal('fetch', fetchMock)

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

    await screen.findByText('pin-chat-1')

    fireEvent.click(screen.getByText('pin-chat-1'))

    await waitFor(() => {
      const pinCall = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'PATCH',
      )
      expect(pinCall?.[1]?.body).toBe(JSON.stringify({ pinned: true }))
    })
  })

  it('hands the pane to another conversation when the open one is archived', async () => {
    const chats = [
      {
        archived: false,
        created_at: '2026-04-14T18:30:00.000Z',
        id: 'chat-1',
        last_message_preview: 'Mensaje 1',
        pinned: false,
        title: 'Chat empresarial',
        updated_at: '2026-04-14T18:32:00.000Z',
      },
      {
        archived: false,
        created_at: '2026-04-14T17:30:00.000Z',
        id: 'chat-2',
        last_message_preview: null,
        pinned: false,
        title: 'Otro chat',
        updated_at: '2026-04-14T17:32:00.000Z',
      },
    ]

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const method = init?.method ?? 'GET'

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse(isArchivedListRequest(requestUrl) ? [] : chats)
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'GET') {
          return jsonResponse({ ...chats[0], messages: [] })
        }

        if (requestUrl.endsWith('/chats/chat-1') && method === 'PATCH') {
          return jsonResponse({ ...chats[0], archived: true, messages: [] })
        }

        throw new Error(`Unexpected request: ${method} ${requestUrl}`)
      },
    )

    vi.stubGlobal('fetch', fetchMock)

    const onSelectChat = vi.fn()
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

    await screen.findByText('archive-chat-1')

    fireEvent.click(screen.getByText('archive-chat-1'))

    await waitFor(() => {
      expect(onSelectChat).toHaveBeenCalledWith('chat-2', { replace: true })
    })

    const archiveCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    )
    expect(archiveCall?.[1]?.body).toBe(JSON.stringify({ archived: true }))
  })

  it('asks the backend for the archived conversations in the archived view', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        const method = init?.method ?? 'GET'

        if (requestUrl.endsWith('/sources/status')) {
          return jsonResponse(sourcesStatusChatReady)
        }

        if (isChatsListRequest(requestUrl, method)) {
          return jsonResponse(
            isArchivedListRequest(requestUrl)
              ? [
                  {
                    archived: true,
                    created_at: '2026-04-14T18:30:00.000Z',
                    id: 'chat-9',
                    last_message_preview: null,
                    pinned: false,
                    title: 'Chat archivado',
                    updated_at: '2026-04-14T18:32:00.000Z',
                  },
                ]
              : [],
          )
        }

        throw new Error(`Unexpected request: ${method} ${requestUrl}`)
      },
    )

    vi.stubGlobal('fetch', fetchMock)

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
          user={{ role: 'user', sub: 'user-1' }}
        />
      </QueryClientProvider>,
    )

    await screen.findByText('showArchived-false')

    fireEvent.click(screen.getByText('toggle-archived-view'))

    await screen.findByText('title-chat-9-Chat archivado')
    expect(screen.getByText('showArchived-true')).toBeTruthy()
  })
})
