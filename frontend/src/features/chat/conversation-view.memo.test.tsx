// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { ConversationView } from './conversation-view'
import type { ChatDetail, ChatMessage } from './types'

/**
 * Counts how often a message bubble's body runs.
 *
 * `getMessageDocument` is called once per bubble per render, so spying on it
 * counts renders without reaching into the component.
 */
const renders = vi.hoisted(() => ({ count: 0 }))

vi.mock('./chat-document', async (importOriginal) => {
  const original = await importOriginal<typeof import('./chat-document')>()

  return {
    ...original,
    getMessageDocument: (message: ChatMessage) => {
      renders.count += 1
      return original.getMessageDocument(message)
    },
  }
})

const labels = {
  assistant: 'Assistant',
  copiedMessage: 'Copied',
  copyMessage: 'Copy message',
  document: 'Generated document',
  downloadDocument: 'Download',
  downloadingDocument: 'Downloading',
  openSource: 'Open source',
  page: 'Page',
  pages: 'Pages',
  sending: 'Sending',
  sources: 'Sources',
  stopped: 'Stopped',
  user: 'User',
}

const shellLabels = {
  jumpToLatest: 'Jump to latest',
  newLineHint: 'for a new line',
  sendHint: 'to send',
  sendMessage: 'Send message',
  stopGenerating: 'Stop generating',
}

const progress = {
  events: [],
  formatElapsed: (seconds: number) => `${seconds}s`,
  formatStep: () => 'step',
  title: 'Working on it',
}

const messages: ChatMessage[] = [
  {
    chat_id: 'chat-1',
    content: 'First answer.',
    created_at: '2026-05-13T12:00:00.000Z',
    id: 'assistant-1',
    metadata: null,
    role: 'assistant',
    status: null,
  },
  {
    chat_id: 'chat-1',
    content: 'Second answer.',
    created_at: '2026-05-13T12:01:00.000Z',
    id: 'assistant-2',
    metadata: null,
    role: 'assistant',
    status: null,
  },
]

const chat: ChatDetail = {
  archived: false,
  created_at: '2026-05-13T12:00:00.000Z',
  id: 'chat-1',
  last_message_preview: null,
  messages,
  pinned: false,
  title: 'A conversation',
  updated_at: '2026-05-13T12:01:00.000Z',
}

function element(
  overrides: Partial<ComponentProps<typeof ConversationView>> = {},
) {
  return (
    <ConversationView
      chat={chat}
      composerPlaceholder="Ask a question"
      composerValue=""
      emptyDescription="No messages"
      emptyTitle="Empty"
      isLoading={false}
      isSending={true}
      locale="en"
      messageLabels={labels}
      onComposerChange={() => undefined}
      onSendMessage={() => undefined}
      progress={progress}
      shellLabels={shellLabels}
      {...overrides}
    />
  )
}

describe('ConversationView memoisation', () => {
  beforeEach(() => {
    // jsdom implements neither, and this file renders the real scroll area.
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    Element.prototype.scrollTo = vi.fn()
  })

  afterEach(() => {
    cleanup()
    renders.count = 0
  })

  it('leaves settled messages alone as a turn reports its progress', () => {
    const { rerender } = render(element())

    expect(renders.count).toBe(messages.length)
    const afterFirstRender = renders.count

    // What a progress event changes: the activity block, and nothing else.
    rerender(
      element({
        progress: { ...progress, events: [{ phase: 'searching' }] },
      }),
    )
    rerender(
      element({
        progress: {
          ...progress,
          events: [{ phase: 'searching' }, { phase: 'reading' }],
        },
      }),
    )

    expect(renders.count).toBe(afterFirstRender)
  })

  it('still renders a message whose content changed', () => {
    const { rerender } = render(element())
    renders.count = 0

    rerender(
      element({
        chat: {
          ...chat,
          messages: [messages[0], { ...messages[1], content: 'Rewritten.' }],
        },
      }),
    )

    expect(renders.count).toBe(1)
    expect(screen.getByText('Rewritten.')).toBeTruthy()
  })
})
