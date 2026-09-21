import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AppLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { ChatSidebarLoadingState } from './chat-loading-state'
import type { ChatSummary } from './types'
import { formatChatTimestamp, getChatPreview, getChatTitle } from './utils'

interface ChatSidebarRowProps {
  archiveChatLabel: string
  chat: ChatSummary
  deleteChatLabel: string
  emptyMessage: string
  isActive: boolean
  isBusy: boolean
  locale: AppLocale
  onDelete: () => void
  onRename: () => void
  onSelect: () => void
  onSetArchived: (chatId: string, archived: boolean) => void | Promise<void>
  onSetPinned: (chatId: string, pinned: boolean) => void | Promise<void>
  pinChatLabel: string
  renameChatLabel: string
  rowActionsLabel: string
  unarchiveChatLabel: string
  unpinChatLabel: string
}

function ChatSidebarRow({
  archiveChatLabel,
  chat,
  deleteChatLabel,
  emptyMessage,
  isActive,
  isBusy,
  locale,
  onDelete,
  onRename,
  onSelect,
  onSetArchived,
  onSetPinned,
  pinChatLabel,
  renameChatLabel,
  rowActionsLabel,
  unarchiveChatLabel,
  unpinChatLabel,
}: Readonly<ChatSidebarRowProps>) {
  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-3xl border transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/10 ring-primary/20 ring-2'
          : 'hover:bg-muted/60 bg-card/60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer px-4 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.5 font-semibold tracking-tight">
            {chat.pinned ? (
              <Pin className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            ) : null}
            <span className="line-clamp-1 min-w-0">
              {getChatTitle(chat.title)}
            </span>
          </p>
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatChatTimestamp(chat.updated_at, locale)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
          {getChatPreview(chat.last_message_preview) || emptyMessage}
        </p>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-2 mr-2 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={rowActionsLabel}
            disabled={isBusy}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* An archived chat has no pin to toggle: archiving cleared it. */}
          {chat.archived ? null : (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                void onSetPinned(chat.id, !chat.pinned)
              }}
            >
              {chat.pinned ? (
                <PinOff className="h-4 w-4" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
              <span>{chat.pinned ? unpinChatLabel : pinChatLabel}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              onRename()
            }}
          >
            <Pencil className="h-4 w-4" />
            <span>{renameChatLabel}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              void onSetArchived(chat.id, !chat.archived)
            }}
          >
            {chat.archived ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            <span>{chat.archived ? unarchiveChatLabel : archiveChatLabel}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault()
              onDelete()
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span>{deleteChatLabel}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

interface ChatSidebarProps {
  activeChatId?: string
  archiveChatLabel: string
  archivedEmptyDescription: string
  archivedEmptyTitle: string
  archivedTitle: string
  backToChatsLabel: string
  chats: ChatSummary[]
  confirmDeleteActionLabel: string
  confirmDeleteCancelLabel: string
  confirmDeleteDescription: string
  confirmDeleteTitle: string
  deleteChatLabel: string
  deletingChatId?: string
  emptyLabel: string
  emptyMessage: string
  isCreating: boolean
  isLoading: boolean
  locale: AppLocale
  newChatLabel: string
  onCreateChat: () => void
  onDeleteChat: (chatId: string) => void | Promise<void>
  onRenameChat: (chatId: string, title: string) => void | Promise<void>
  onSelectChat: (chatId: string) => void
  onSetChatArchived: (chatId: string, archived: boolean) => void | Promise<void>
  onSetChatPinned: (chatId: string, pinned: boolean) => void | Promise<void>
  onShowArchivedChange: (showArchived: boolean) => void
  pinChatLabel: string
  pinnedSectionLabel: string
  recentSectionLabel: string
  renameCancelLabel: string
  renameChatLabel: string
  renameDescription: string
  renameFieldLabel: string
  renameSaveLabel: string
  renameTitle: string
  renamingChatId?: string
  rowActionsLabel: string
  showArchived: boolean
  unarchiveChatLabel: string
  unpinChatLabel: string
  updatingChatId?: string
  viewArchivedLabel: string
}

export function ChatSidebar({
  activeChatId,
  archiveChatLabel,
  archivedEmptyDescription,
  archivedEmptyTitle,
  archivedTitle,
  backToChatsLabel,
  chats,
  confirmDeleteActionLabel,
  confirmDeleteCancelLabel,
  confirmDeleteDescription,
  confirmDeleteTitle,
  deleteChatLabel,
  deletingChatId,
  emptyLabel,
  emptyMessage,
  isCreating,
  isLoading,
  locale,
  newChatLabel,
  onCreateChat,
  onDeleteChat,
  onRenameChat,
  onSelectChat,
  onSetChatArchived,
  onSetChatPinned,
  onShowArchivedChange,
  pinChatLabel,
  pinnedSectionLabel,
  recentSectionLabel,
  renameCancelLabel,
  renameChatLabel,
  renameDescription,
  renameFieldLabel,
  renameSaveLabel,
  renameTitle,
  renamingChatId,
  rowActionsLabel,
  showArchived,
  unarchiveChatLabel,
  unpinChatLabel,
  updatingChatId,
  viewArchivedLabel,
}: Readonly<ChatSidebarProps>) {
  const [chatPendingDelete, setChatPendingDelete] =
    useState<ChatSummary | null>(null)
  const [chatPendingRename, setChatPendingRename] =
    useState<ChatSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const isRenaming = Boolean(renamingChatId)
  const trimmedRenameValue = renameValue.trim()

  // Archiving clears the pin, so the archived list never has a pinned section.
  const pinnedChats = showArchived ? [] : chats.filter((chat) => chat.pinned)
  const unpinnedChats = showArchived
    ? chats
    : chats.filter((chat) => !chat.pinned)

  const handleConfirmDelete = async () => {
    if (!chatPendingDelete) {
      return
    }

    await onDeleteChat(chatPendingDelete.id)
    setChatPendingDelete(null)
  }

  const startRename = (chat: ChatSummary) => {
    setChatPendingRename(chat)
    setRenameValue(getChatTitle(chat.title))
  }

  const handleSubmitRename = async () => {
    if (!chatPendingRename || !trimmedRenameValue) {
      return
    }

    await onRenameChat(chatPendingRename.id, trimmedRenameValue)
    setChatPendingRename(null)
  }

  const renderChatRow = (chat: ChatSummary) => (
    <ChatSidebarRow
      key={chat.id}
      archiveChatLabel={archiveChatLabel}
      chat={chat}
      deleteChatLabel={deleteChatLabel}
      emptyMessage={emptyMessage}
      isActive={activeChatId === chat.id}
      isBusy={
        deletingChatId === chat.id ||
        renamingChatId === chat.id ||
        updatingChatId === chat.id
      }
      locale={locale}
      onDelete={() => setChatPendingDelete(chat)}
      onRename={() => startRename(chat)}
      onSelect={() => onSelectChat(chat.id)}
      onSetArchived={onSetChatArchived}
      onSetPinned={onSetChatPinned}
      pinChatLabel={pinChatLabel}
      renameChatLabel={renameChatLabel}
      rowActionsLabel={rowActionsLabel}
      unarchiveChatLabel={unarchiveChatLabel}
      unpinChatLabel={unpinChatLabel}
    />
  )

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {showArchived ? (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label={backToChatsLabel}
            onClick={() => onShowArchivedChange(false)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="font-semibold tracking-tight">{archivedTitle}</p>
        </div>
      ) : (
        <Button
          onClick={onCreateChat}
          disabled={isCreating}
          className="h-11 justify-start gap-2 rounded-2xl"
        >
          <Plus className="h-4 w-4" />
          <span>{newChatLabel}</span>
        </Button>
      )}

      <ScrollArea className="min-h-0 flex-1 pr-1">
        {isLoading ? <ChatSidebarLoadingState /> : null}

        {!isLoading && chats.length === 0 ? (
          <div className="text-muted-foreground flex h-full min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed px-5 text-center">
            {showArchived ? (
              <Archive className="mb-3 h-8 w-8" />
            ) : (
              <MessageSquareText className="mb-3 h-8 w-8" />
            )}
            <p className="font-semibold">
              {showArchived ? archivedEmptyTitle : emptyLabel}
            </p>
            <p className="mt-1 text-sm">
              {showArchived ? archivedEmptyDescription : emptyMessage}
            </p>
          </div>
        ) : null}

        {!isLoading ? (
          <div className="space-y-2">
            {pinnedChats.length > 0 ? (
              <>
                <p className="text-muted-foreground px-2 pt-1 text-xs font-semibold tracking-wide uppercase">
                  {pinnedSectionLabel}
                </p>
                {pinnedChats.map(renderChatRow)}
              </>
            ) : null}

            {pinnedChats.length > 0 && unpinnedChats.length > 0 ? (
              <p className="text-muted-foreground px-2 pt-3 text-xs font-semibold tracking-wide uppercase">
                {recentSectionLabel}
              </p>
            ) : null}

            {unpinnedChats.map(renderChatRow)}
          </div>
        ) : null}
      </ScrollArea>

      {showArchived ? null : (
        <Button
          variant="ghost"
          className="h-10 justify-start gap-2 rounded-2xl"
          onClick={() => onShowArchivedChange(true)}
        >
          <Archive className="h-4 w-4" />
          <span>{viewArchivedLabel}</span>
        </Button>
      )}

      <Dialog
        open={Boolean(chatPendingRename)}
        onOpenChange={(open) => {
          if (!open && !isRenaming) {
            setChatPendingRename(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{renameTitle}</DialogTitle>
            <DialogDescription>{renameDescription}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSubmitRename()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="chat-rename-title">{renameFieldLabel}</Label>
              <Input
                id="chat-rename-title"
                autoFocus
                maxLength={60}
                value={renameValue}
                disabled={isRenaming}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isRenaming}
                onClick={() => setChatPendingRename(null)}
              >
                {renameCancelLabel}
              </Button>
              <Button
                type="submit"
                disabled={isRenaming || !trimmedRenameValue}
              >
                {renameSaveLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(chatPendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setChatPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDeleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingChatId)}>
              {confirmDeleteCancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deletingChatId)}
              onClick={() => void handleConfirmDelete()}
            >
              {confirmDeleteActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
