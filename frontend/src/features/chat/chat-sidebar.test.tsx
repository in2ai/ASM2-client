// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type {
  ButtonHTMLAttributes,
  ComponentProps,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from 'react'
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

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('lucide-react', () => ({
  Archive: () => null,
  ArchiveRestore: () => null,
  ArrowLeft: () => null,
  MessageSquareText: () => null,
  MoreHorizontal: () => null,
  Pencil: () => null,
  Pin: () => null,
  PinOff: () => null,
  Plus: () => null,
  Trash2: () => null,
}))

const chats: ChatSummary[] = [
  {
    archived: false,
    created_at: '2026-05-01T12:00:00.000Z',
    id: 'chat-1',
    last_message_preview: 'Latest answer',
    pinned: false,
    title: 'Project policy',
    updated_at: '2026-05-02T12:00:00.000Z',
  },
  {
    archived: false,
    created_at: '2026-05-01T11:00:00.000Z',
    id: 'chat-2',
    last_message_preview: null,
    pinned: false,
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
      archiveChatLabel="Archive conversation"
      archivedEmptyDescription="Archived conversations are kept here."
      archivedEmptyTitle="Nothing archived"
      archivedTitle="Archived"
      backToChatsLabel="Back to conversations"
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
      onRenameChat={() => undefined}
      onSelectChat={() => undefined}
      onSetChatArchived={() => undefined}
      onSetChatPinned={() => undefined}
      onShowArchivedChange={() => undefined}
      pinChatLabel="Pin conversation"
      pinnedSectionLabel="Pinned"
      recentSectionLabel="Recent"
      renameCancelLabel="Cancel"
      renameChatLabel="Rename conversation"
      renameDescription="Pick a name you will recognise."
      renameFieldLabel="Conversation name"
      renameSaveLabel="Save"
      renameTitle="Rename this conversation"
      renamingChatId={undefined}
      rowActionsLabel="Conversation actions"
      showArchived={false}
      unarchiveChatLabel="Unarchive conversation"
      unpinChatLabel="Unpin conversation"
      updatingChatId={undefined}
      viewArchivedLabel="Archived"
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

  it('renames a conversation from its current title', async () => {
    const onRenameChat = vi.fn()

    renderSidebar({ onRenameChat })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Rename conversation' })[0],
    )
    expect(screen.getByText('Rename this conversation')).toBeTruthy()

    const field = screen.getByLabelText<HTMLInputElement>('Conversation name')
    expect(field.value).toBe('Project policy')

    fireEvent.change(field, { target: { value: '  Holiday policy  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onRenameChat).toHaveBeenCalledWith('chat-1', 'Holiday policy')
    })
  })

  it('pins an unpinned conversation and unpins a pinned one', () => {
    const onSetChatPinned = vi.fn()

    renderSidebar({ onSetChatPinned })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Pin conversation' })[0],
    )
    expect(onSetChatPinned).toHaveBeenCalledWith('chat-1', true)

    cleanup()

    renderSidebar({
      chats: [{ ...chats[0], pinned: true }],
      onSetChatPinned,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Unpin conversation' }))
    expect(onSetChatPinned).toHaveBeenCalledWith('chat-1', false)
  })

  it('groups pinned conversations above the rest', () => {
    renderSidebar({ chats: [{ ...chats[0], pinned: true }, chats[1]] })

    expect(screen.getByText('Pinned')).toBeTruthy()
    expect(screen.getByText('Recent')).toBeTruthy()
  })

  it('leaves out the section headings when nothing is pinned', () => {
    renderSidebar()

    expect(screen.queryByText('Pinned')).toBeNull()
    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('archives a conversation from the active list', () => {
    const onSetChatArchived = vi.fn()

    renderSidebar({ onSetChatArchived })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Archive conversation' })[0],
    )

    expect(onSetChatArchived).toHaveBeenCalledWith('chat-1', true)
  })

  it('switches to the archived view', () => {
    const onShowArchivedChange = vi.fn()

    renderSidebar({ onShowArchivedChange })

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))

    expect(onShowArchivedChange).toHaveBeenCalledWith(true)
  })

  it('unarchives from the archived view and offers no pin there', () => {
    const onSetChatArchived = vi.fn()

    renderSidebar({
      chats: [{ ...chats[0], archived: true }],
      onSetChatArchived,
      showArchived: true,
    })

    expect(
      screen.queryByRole('button', { name: 'Pin conversation' }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Unarchive conversation' }),
    )

    expect(onSetChatArchived).toHaveBeenCalledWith('chat-1', false)
  })

  it('returns to the active list from the archived view', () => {
    const onShowArchivedChange = vi.fn()

    renderSidebar({ chats: [], onShowArchivedChange, showArchived: true })

    expect(screen.getByText('Nothing archived')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to conversations' }),
    )

    expect(onShowArchivedChange).toHaveBeenCalledWith(false)
  })

  it('keeps the rename disabled while the title is blank', () => {
    const onRenameChat = vi.fn()

    renderSidebar({ onRenameChat })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Rename conversation' })[0],
    )
    fireEvent.change(screen.getByLabelText('Conversation name'), {
      target: { value: '   ' },
    })

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save.hasAttribute('disabled')).toBe(true)

    fireEvent.click(save)
    expect(onRenameChat).not.toHaveBeenCalled()
  })
})
