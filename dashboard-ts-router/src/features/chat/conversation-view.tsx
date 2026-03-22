import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { type AppLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'
import { ArrowUp, Bot, ExternalLink, Loader2, User2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { ChatConversationLoadingState } from './chat-loading-state'
import type { ChatDetail, ChatMessage, ChatSource } from './types'
import { formatMessageTimestamp } from './utils'

interface ConversationViewProps {
  chat?: ChatDetail
  composerDisabled?: boolean
  composerHint?: string
  composerPlaceholder: string
  composerValue: string
  emptyDescription: string
  emptyPrimaryActionLabel?: string
  emptyTitle: string
  errorMessage?: string
  isLoading: boolean
  isSending: boolean
  locale: AppLocale
  messageLabels: {
    assistant: string
    openSource: string
    sources: string
    sending: string
    user: string
  }
  onEmptyPrimaryAction?: () => void
  onComposerChange: (value: string) => void
  onSendMessage: () => void
  pendingMessage?: ChatMessage | null
  title: string
}

export function ConversationView({
  chat,
  composerDisabled = false,
  composerHint,
  composerPlaceholder,
  composerValue,
  emptyDescription,
  emptyPrimaryActionLabel,
  emptyTitle,
  errorMessage,
  isLoading,
  isSending,
  locale,
  messageLabels,
  onEmptyPrimaryAction,
  onComposerChange,
  onSendMessage,
  pendingMessage,
  title,
}: Readonly<ConversationViewProps>) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messages = useMemo(
    () => [
      ...(chat?.messages ?? []),
      ...(pendingMessage ? [pendingMessage] : []),
    ],
    [chat?.messages, pendingMessage],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {chat?.title ?? emptyDescription}
        </p>
      </div>

      <div className="bg-muted/10 min-h-0 flex-1 overflow-hidden">
        {isLoading ? <ChatConversationLoadingState /> : null}

        {!isLoading && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="bg-primary/10 mb-4 rounded-full p-3">
              <Bot className="text-primary h-7 w-7" />
            </div>
            <p className="text-xl font-semibold tracking-tight">{emptyTitle}</p>
            <p className="text-muted-foreground mt-2 max-w-lg text-sm">
              {emptyDescription}
            </p>
            {emptyPrimaryActionLabel && onEmptyPrimaryAction ? (
              <Button
                className="mt-5 rounded-2xl"
                onClick={onEmptyPrimaryAction}
              >
                {emptyPrimaryActionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!isLoading && messages.length > 0 ? (
          <ScrollArea className="h-full px-4 py-6 sm:px-6">
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  locale={locale}
                  message={message}
                  labels={messageLabels}
                />
              ))}

              {isSending ? (
                <div className="flex items-center gap-3 px-1 text-sm">
                  <Loader2 className="text-primary h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground">
                    {messageLabels.sending}
                  </span>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        ) : null}
      </div>

      <div className="border-t bg-background px-4 py-4 sm:px-6">
        {errorMessage ? (
          <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {errorMessage}
          </div>
        ) : null}
        {!errorMessage && composerHint ? (
          <div className="text-muted-foreground mb-3 text-sm">
            {composerHint}
          </div>
        ) : null}

        <div className="rounded-3xl border bg-card p-3 shadow-sm">
          <Textarea
            disabled={composerDisabled}
            value={composerValue}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (composerDisabled) {
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSendMessage()
              }
            }}
            placeholder={composerPlaceholder}
            className="min-h-24 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <div className="mt-3 flex items-center justify-end">
            <Button
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled={composerDisabled || !composerValue.trim() || isSending}
              onClick={onSendMessage}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  locale,
  message,
  labels,
}: Readonly<{
  locale: AppLocale
  message: ChatMessage
  labels: ConversationViewProps['messageLabels']
}>) {
  const isUser = message.role === 'user'
  const authorLabel = isUser ? labels.user : labels.assistant
  const sources = getMessageSources(message)

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser ? <BubbleAvatar isUser={false} /> : null}
      <div
        className={cn(
          'max-w-[85%] rounded-3xl border px-4 py-3 shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground border-primary/20'
            : 'bg-card',
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
            {authorLabel}
          </span>
          <span className="text-xs opacity-70">
            {formatMessageTimestamp(message.created_at, locale)}
          </span>
          {message.status === 'sending' ? (
            <Badge variant="outline">{labels.sending}</Badge>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6">
          {message.content}
        </p>
        {!isUser && sources.length > 0 ? (
          <div className="mt-4 border-t pt-3">
            <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-[0.18em]">
              {labels.sources}
            </p>
            <div className="space-y-2">
              {sources.map((source) => (
                <SourceCitation
                  key={`${source.source_type}-${source.title}-${source.link ?? 'nolink'}`}
                  source={source}
                  openLabel={labels.openSource}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {isUser ? <BubbleAvatar isUser={true} /> : null}
    </div>
  )
}

function SourceCitation({
  openLabel,
  source,
}: Readonly<{
  openLabel: string
  source: ChatSource
}>) {
  return (
    <div className="bg-muted/40 rounded-2xl border px-3 py-2">
      <p className="text-sm font-medium">{source.title}</p>
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span>{source.source_type}</span>
        {source.link ? (
          <a
            href={source.link}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {openLabel}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function getMessageSources(message: ChatMessage): ChatSource[] {
  if (!message.metadata?.sources || !Array.isArray(message.metadata.sources)) {
    return []
  }

  return message.metadata.sources.filter((source): source is ChatSource =>
    Boolean(
      source &&
      typeof source.title === 'string' &&
      typeof source.source_type === 'string' &&
      (typeof source.link === 'string' || source.link === null),
    ),
  )
}

function BubbleAvatar({ isUser }: Readonly<{ isUser: boolean }>) {
  return (
    <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full border">
      {isUser ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  )
}
