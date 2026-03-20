import { MessageSquareText, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { ChatSidebarLoadingState } from './chat-loading-state'
import type { ChatSummary } from './types'
import { formatChatTimestamp, getChatPreview, getChatTitle } from './utils'
import { type AppLocale } from '@/i18n/config'

interface ChatSidebarProps {
  activeChatId?: string
  chats: ChatSummary[]
  emptyLabel: string
  emptyMessage: string
  isCreating: boolean
  isLoading: boolean
  locale: AppLocale
  newChatLabel: string
  onCreateChat: () => void
  onSelectChat: (chatId: string) => void
}

export function ChatSidebar({
  activeChatId,
  chats,
  emptyLabel,
  emptyMessage,
  isCreating,
  isLoading,
  locale,
  newChatLabel,
  onCreateChat,
  onSelectChat,
}: Readonly<ChatSidebarProps>) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Button onClick={onCreateChat} disabled={isCreating} className="h-11 justify-start gap-2 rounded-2xl">
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

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelectChat(chat.id)}
                  className={cn(
                    'w-full rounded-3xl border px-4 py-3 text-left transition-colors',
                    isActive
                      ? 'border-primary/40 bg-primary/10 ring-primary/20 ring-2'
                      : 'hover:bg-muted/60 bg-card/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-1 font-semibold tracking-tight">
                      {getChatTitle(chat.title)}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatChatTimestamp(chat.updated_at, locale)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {getChatPreview(chat.last_message_preview) || emptyMessage}
                  </p>
                </button>
              )
            })}
          </div>
        ) : null}
      </ScrollArea>
    </div>
  )
}
