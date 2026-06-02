import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { AppLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'
import { ArrowUp, Bot, ExternalLink, Loader2, User2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { ChatConversationLoadingState } from './chat-loading-state'
import { MessageMarkdown } from './message-markdown'
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
    page: string
    pages: string
    sources: string
    sending: string
    user: string
  }
  onEmptyPrimaryAction?: () => void
  onComposerChange: (value: string) => void
  onSendMessage: () => void
  pendingMessage?: ChatMessage | null
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
    <div className="bg-muted/5 flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? <ChatConversationLoadingState /> : null}

        {!isLoading && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="bg-primary/10 ring-primary/5 mb-5 rounded-2xl p-4 ring-8">
              <Bot className="text-primary h-8 w-8" />
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {emptyTitle}
            </p>
            <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
              {emptyDescription}
            </p>
            {emptyPrimaryActionLabel && onEmptyPrimaryAction ? (
              <Button
                className="mt-6 rounded-2xl"
                onClick={onEmptyPrimaryAction}
              >
                {emptyPrimaryActionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!isLoading && messages.length > 0 ? (
          <ScrollArea className="h-full px-4 py-8 sm:px-6">
            <div className="mx-auto w-full max-w-3xl space-y-6">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  locale={locale}
                  message={message}
                  labels={messageLabels}
                />
              ))}

              {isSending ? (
                <div className="text-muted-foreground flex items-center gap-3 px-1 text-sm">
                  <Loader2 className="text-primary h-4 w-4 animate-spin" />
                  <span>{messageLabels.sending}</span>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        ) : null}
      </div>

      <div className="px-4 pt-2 pb-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {errorMessage ? (
            <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </div>
          ) : null}
          {!errorMessage && composerHint ? (
            <div className="text-muted-foreground mb-3 px-1 text-sm">
              {composerHint}
            </div>
          ) : null}

          <div className="bg-card focus-within:ring-primary/30 focus-within:border-primary/40 rounded-3xl border p-3 shadow-lg transition-shadow focus-within:ring-2">
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
              className="max-h-48 min-h-20 resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-end px-1">
              <Button
                size="icon"
                className="h-10 w-10 rounded-full"
                disabled={
                  composerDisabled || !composerValue.trim() || isSending
                }
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
    <div
      className={cn(
        'flex gap-3 sm:gap-4',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {!isUser ? <BubbleAvatar isUser={false} /> : null}
      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-3xl px-5 py-4 shadow-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-card border',
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
            {authorLabel}
          </span>
          <span className="text-[11px] opacity-60">
            {formatMessageTimestamp(message.created_at, locale)}
          </span>
        </div>
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <MessageMarkdown content={message.content} />
        )}
        {!isUser && sources.length > 0 ? (
          <div className="mt-4 border-t pt-3">
            <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
              {labels.sources}
            </p>
            <div className="space-y-2">
              {sources.map((source) => (
                <SourceCitation
                  key={`${source.source_type}-${source.title}-${source.link ?? 'nolink'}`}
                  labels={labels}
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
  labels,
  openLabel,
  source,
}: Readonly<{
  labels: Pick<ConversationViewProps['messageLabels'], 'page' | 'pages'>
  openLabel: string
  source: ChatSource
}>) {
  const pagesLabel = formatSourcePages(source.pages, labels)

  return (
    <div className="bg-muted/40 hover:bg-muted/60 rounded-2xl border px-4 py-3 transition-colors">
      <p className="text-sm font-medium">{source.title}</p>
      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span>{source.source_type}</span>
        {pagesLabel ? <span>{pagesLabel}</span> : null}
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

  return (message.metadata.sources as unknown[]).filter(
    (source): source is ChatSource => {
      if (!source || typeof source !== 'object') {
        return false
      }

      const candidate = source as Partial<ChatSource>

      return (
        typeof candidate.title === 'string' &&
        typeof candidate.source_type === 'string' &&
        (typeof candidate.link === 'string' || candidate.link === null) &&
        isValidSourcePages(candidate.pages)
      )
    },
  )
}

function isValidSourcePages(pages: unknown): pages is number[] | undefined {
  return (
    pages === undefined ||
    (Array.isArray(pages) &&
      pages.every((page) => typeof page === 'number' && Number.isInteger(page)))
  )
}

function formatSourcePages(
  pages: number[] | undefined,
  labels: Pick<ConversationViewProps['messageLabels'], 'page' | 'pages'>,
): string | null {
  if (!pages?.length) {
    return null
  }

  return pages.length === 1
    ? `${labels.page} ${pages[0]}`
    : `${labels.pages} ${pages.join(', ')}`
}

function BubbleAvatar({ isUser }: Readonly<{ isUser: boolean }>) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border',
        isUser
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {isUser ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  )
}
