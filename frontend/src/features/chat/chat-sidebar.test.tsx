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
  MessageSquareText: () => null,
  MoreHorizontal: () => null,
  Pencil: () => null,
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
      onRenameChat={() => undefined}
      onSelectChat={() => undefined}
      renameCancelLabel="Cancel"
      renameChatLabel="Rename conversation"
      renameDescription="Pick a name you will recognise."
      renameFieldLabel="Conversation name"
      renameSaveLabel="Save"
      renameTitle="Rename this conversation"
      renamingChatId={undefined}
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
