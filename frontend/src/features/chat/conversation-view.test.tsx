// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type {
  ButtonHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { ConversationView } from './conversation-view'
import type { ChatDetail, ChatMessage } from './types'

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}))

vi.mock('lucide-react', () => ({
  ArrowUp: () => null,
  Bot: () => null,
  ExternalLink: () => null,
  Loader2: () => null,
  User2: () => null,
}))

const defaultLabels = {
  assistant: 'Assistant',
  openSource: 'Open source',
  page: 'Page',
  pages: 'Pages',
  sending: 'Sending',
  sources: 'Sources',
  user: 'User',
}

const defaultTimestamp = '2026-05-13T12:00:00.000Z'

function createMessage(
  overrides: Partial<ChatMessage> & Pick<ChatMessage, 'content' | 'role'>,
): ChatMessage {
  return {
    chat_id: 'chat-1',
    created_at: defaultTimestamp,
    id: `${overrides.role}-${Math.random()}`,
    metadata: null,
    status: null,
    ...overrides,
  }
}

function createChat(messages: ChatMessage[]): ChatDetail {
  return {
    created_at: defaultTimestamp,
    id: 'chat-1',
    last_message_preview: null,
    messages,
    title: 'Markdown chat',
    updated_at: defaultTimestamp,
  }
}

function renderConversation(messages: ChatMessage[]) {
  return render(
    <ConversationView
      chat={createChat(messages)}
      composerPlaceholder="Ask a question"
      composerValue=""
      emptyDescription="No messages"
      emptyTitle="Empty"
      errorMessage={undefined}
      isLoading={false}
      isSending={false}
      locale="en"
      messageLabels={defaultLabels}
      onComposerChange={() => undefined}
      onSendMessage={() => undefined}
    />,
  )
}

describe('ConversationView markdown rendering', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders assistant markdown with GFM blocks', () => {
    const { container } = renderConversation([
      createMessage({
        content: [
          '## Answer',
          '',
          'This has **bold** text.',
          '',
          '- first',
          '- second',
          '',
          '```ts',
          'const value = 1',
          '```',
          '',
          '| Name | Value |',
          '| --- | --- |',
          '| Alpha | Bravo |',
        ].join('\n'),
        role: 'assistant',
      }),
    ])

    expect(
      screen.getByRole('heading', { level: 3, name: 'Answer' }),
    ).toBeTruthy()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByRole('list')).toBeTruthy()
    expect(container.querySelector('pre code')?.textContent).toContain(
      'const value = 1',
    )
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('keeps user markdown-like content literal', () => {
    const { container } = renderConversation([
      createMessage({
        content: '**do not format**\n- still literal',
        role: 'user',
      }),
    ])

    const literalMessage = screen.getByText(/\*\*do not format\*\*/)

    expect(literalMessage.tagName).toBe('P')
    expect(literalMessage.textContent).toBe(
      '**do not format**\n- still literal',
    )
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('ignores raw HTML, unsafe links, and markdown images', () => {
    renderConversation([
      createMessage({
        content: [
          '<script>alert("x")</script>',
          '[bad](javascript:alert(1))',
          '![Hidden image](https://example.test/image.png)',
          '[ok](https://example.com)',
        ].join('\n\n'),
        role: 'assistant',
      }),
    ])

    const unsafeLink = screen.getByText('bad').closest('a')
    const safeLink = screen.getByRole('link', { name: 'ok' })

    expect(screen.queryByText(/alert/)).toBeNull()
    expect(unsafeLink).toBeTruthy()
    expect(unsafeLink?.getAttribute('href')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(safeLink).toHaveProperty('target', '_blank')
    expect(safeLink.getAttribute('rel')).toBe('noreferrer noopener')
  })

  it('keeps assistant source citations below markdown content', () => {
    renderConversation([
      createMessage({
        content: 'Assistant response with **formatting**.',
        metadata: {
          sources: [
            {
              link: 'https://docs.example.test/source',
              pages: [2, 4],
              source_type: 'drive',
              title: 'Source document',
            },
          ],
        },
        role: 'assistant',
      }),
    ])

    expect(screen.getByText('formatting').tagName).toBe('STRONG')
    expect(screen.getByText('Sources')).toBeTruthy()
    expect(screen.getByText('Source document')).toBeTruthy()
    expect(screen.getByText('Pages 2, 4')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open source/ })).toHaveProperty(
      'href',
      'https://docs.example.test/source',
    )
  })

  it('ignores invalid source page metadata', () => {
    const invalidMetadata = {
      sources: [
        {
          link: 'https://docs.example.test/source',
          pages: ['2'],
          source_type: 'drive',
          title: 'Invalid source document',
        },
      ],
    } as unknown as ChatMessage['metadata']

    renderConversation([
      createMessage({
        content: 'Assistant response.',
        metadata: invalidMetadata,
        role: 'assistant',
      }),
    ])

    expect(screen.queryByText('Invalid source document')).toBeNull()
  })

  it('uses scrollable containers for long code blocks and tables', () => {
    const { container } = renderConversation([
      createMessage({
        content: [
          '```',
          'const longValue = "abcdefghijklmnopqrstuvwxyz".repeat(20)',
          '```',
          '',
          '| Column one | Column two | Column three |',
          '| --- | --- | --- |',
          '| Very long cell value | Another long cell value | Final long cell value |',
        ].join('\n'),
        role: 'assistant',
      }),
    ])

    const pre = container.querySelector('pre')
    const table = container.querySelector('table')

    expect(pre?.className).toContain('overflow-x-auto')
    expect(table?.parentElement?.className).toContain('overflow-x-auto')
    expect(table?.closest('.min-w-0')).toBeTruthy()
  })
})
