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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AppLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'
import { MessageSquareText, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ChatSidebarLoadingState } from './chat-loading-state'
import type { ChatSummary } from './types'
import { formatChatTimestamp, getChatPreview, getChatTitle } from './utils'

interface ChatSidebarProps {
  activeChatId?: string
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
  onSelectChat: (chatId: string) => void
  rowActionsLabel: string
}

export function ChatSidebar({
  activeChatId,
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
  onSelectChat,
  rowActionsLabel,
}: Readonly<ChatSidebarProps>) {
  const [chatPendingDelete, setChatPendingDelete] =
    useState<ChatSummary | null>(null)

  const handleConfirmDelete = async () => {
    if (!chatPendingDelete) {
      return
    }

    await onDeleteChat(chatPendingDelete.id)
    setChatPendingDelete(null)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Button
        onClick={onCreateChat}
        disabled={isCreating}
        className="h-11 justify-start gap-2 rounded-2xl"
      >
        <Plus className="h-4 w-4" />
        <span>{newChatLabel}</span>
      </Button>

      <ScrollArea className="min-h-0 flex-1 pr-1">
        {isLoading ? <ChatSidebarLoadingState /> : null}

        {!isLoading && chats.length === 0 ? (
          <div className="text-muted-foreground flex h-full min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed px-5 text-center">
            <MessageSquareText className="mb-3 h-8 w-8" />
            <p className="font-semibold">{emptyLabel}</p>
            <p className="mt-1 text-sm">{emptyMessage}</p>
          </div>
        ) : null}

        {!isLoading ? (
          <div className="space-y-2">
            {chats.map((chat) => {
              const isActive = activeChatId === chat.id
              const isDeleting = deletingChatId === chat.id

              return (
                <div
                  key={chat.id}
                  className={cn(
                    'group flex items-start gap-2 rounded-3xl border transition-colors',
                    isActive
                      ? 'border-primary/40 bg-primary/10 ring-primary/20 ring-2'
                      : 'hover:bg-muted/60 bg-card/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChat(chat.id)}
                    className="min-w-0 flex-1 cursor-pointer px-4 py-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-1 min-w-0 font-semibold tracking-tight">
                        {getChatTitle(chat.title)}
                      </p>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatChatTimestamp(chat.updated_at, locale)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {getChatPreview(chat.last_message_preview) ||
                        emptyMessage}
                    </p>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="mt-2 mr-2 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:opacity-100"
                        aria-label={rowActionsLabel}
                        disabled={isDeleting}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                          event.preventDefault()
                          setChatPendingDelete(chat)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>{deleteChatLabel}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        ) : null}
      </ScrollArea>

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
