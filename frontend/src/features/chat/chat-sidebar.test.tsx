// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { ChatSidebar } from './chat-sidebar'
import type { ChatSummary } from './types'

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({
    children,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string
    variant?: string
  }) => <button {...props}>{children}</button>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: (event: { preventDefault: () => void }) => void
  }) => (
    <button onClick={() => onSelect?.({ preventDefault: () => undefined })}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('lucide-react', () => ({
  MessageSquareText: () => null,
  MoreHorizontal: () => null,
  Plus: () => null,
  Trash2: () => null,
}))

const chats: ChatSummary[] = [
  {
    created_at: '2026-05-01T12:00:00.000Z',
    id: 'chat-1',
    last_message_preview: 'Latest answer',
    title: 'Project policy',
    updated_at: '2026-05-02T12:00:00.000Z',
  },
  {
    created_at: '2026-05-01T11:00:00.000Z',
    id: 'chat-2',
    last_message_preview: null,
    title: '',
    updated_at: '2026-05-01T11:00:00.000Z',
  },
]

function renderSidebar(
  overrides: Partial<ComponentProps<typeof ChatSidebar>> = {},
) {
  return render(
    <ChatSidebar
      activeChatId="chat-1"
      chats={chats}
      confirmDeleteActionLabel="Delete"
      confirmDeleteCancelLabel="Cancel"
      confirmDeleteDescription="This cannot be undone."
      confirmDeleteTitle="Delete conversation?"
      deleteChatLabel="Delete conversation"
      deletingChatId={undefined}
      emptyLabel="No conversations"
      emptyMessage="Start a conversation"
      isCreating={false}
      isLoading={false}
      locale="en"
      newChatLabel="New conversation"
      onCreateChat={() => undefined}
      onDeleteChat={() => undefined}
      onSelectChat={() => undefined}
      rowActionsLabel="Conversation actions"
      {...overrides}
    />,
  )
}

describe('ChatSidebar', () => {
  afterEach(() => {
    cleanup()
  })

  it('selects conversations and renders fallback labels', () => {
    const onSelectChat = vi.fn()

    renderSidebar({ onSelectChat })

    fireEvent.click(screen.getByRole('button', { name: /Project policy/ }))

    expect(onSelectChat).toHaveBeenCalledWith('chat-1')
    expect(screen.getAllByText('New conversation')).toHaveLength(2)
    expect(screen.getByText('Start a conversation')).toBeTruthy()
  })

  it('confirms a conversation before deleting it', async () => {
    const onDeleteChat = vi.fn()

    renderSidebar({ onDeleteChat })

    fireEvent.click(
      screen.getAllByRole('button', { name: /Delete conversation/ })[0],
    )
    expect(screen.getByText('Delete conversation?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(onDeleteChat).toHaveBeenCalledWith('chat-1')
    })
  })
})
