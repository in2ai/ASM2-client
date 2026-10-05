import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useStickToBottom } from '@/hooks/use-stick-to-bottom'
import type { AppLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Square,
} from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { ChatActivity } from './chat-activity'
import { BubbleAvatar } from './chat-avatar'
import { ChatConversationLoadingState } from './chat-loading-state'
import {
  formatDocumentSize,
  getDocumentFormatLabel,
  getMessageDocument,
} from './chat-document'
import { MessageMarkdown } from './message-markdown'
import type {
  ChatDetail,
  ChatDocument,
  ChatMessage,
  ChatProgressEvent,
  ChatSource,
} from './types'
import { formatMessageTimestamp } from './utils'

interface ConversationViewProps {
  chat?: ChatDetail
  composerDisabled?: boolean
  composerHint?: string
  composerPlaceholder: string
  composerValue: string
  documentDownloadErrors?: Readonly<Record<string, string>>
  downloadingDocumentMessageIds?: ReadonlySet<string>
  emptyDescription: string
  emptyPrimaryActionLabel?: string
  emptyTitle: string
  errorMessage?: string
  isLoading: boolean
  isSending: boolean
  locale: AppLocale
  messageLabels: {
    assistant: string
    copyMessage: string
    copiedMessage: string
    document: string
    downloadDocument: string
    downloadingDocument: string
    openSource: string
    page: string
    pages: string
    sources: string
    sending: string
    user: string
  }
  onDownloadDocument?: (message: ChatMessage) => void
  onEmptyPrimaryAction?: () => void
  onComposerChange: (value: string) => void
  onSendMessage: () => void
  /** Abandons the running turn. Absent when there is nothing to stop. */
  onStopGeneration?: () => void
  shellLabels: {
    jumpToLatest: string
    newLineHint: string
    sendHint: string
    stopGenerating: string
  }
  pendingMessage?: ChatMessage | null
  /** What the backend is doing right now, while an answer is on its way. */
  progress: {
    events: readonly ChatProgressEvent[]
    formatElapsed: (seconds: number) => string
    formatStep: (event: ChatProgressEvent) => string
    /** When this turn started, so the elapsed count is not reset by a remount. */
    startedAt?: number
    title: string
  }
}

export function ConversationView({
  chat,
  composerDisabled = false,
  composerHint,
  composerPlaceholder,
  composerValue,
  documentDownloadErrors,
  downloadingDocumentMessageIds,
  emptyDescription,
  emptyPrimaryActionLabel,
  emptyTitle,
  errorMessage,
  isLoading,
  isSending,
  locale,
  messageLabels,
  onDownloadDocument,
  onEmptyPrimaryAction,
  onComposerChange,
  onSendMessage,
  onStopGeneration,
  pendingMessage,
  progress,
  shellLabels,
}: Readonly<ConversationViewProps>) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const { followIfPinned, isPinned, scrollToBottom, viewportRef } =
    useStickToBottom()
  const messages = useMemo(
    () => [
      ...(chat?.messages ?? []),
      ...(pendingMessage ? [pendingMessage] : []),
    ],
    [chat?.messages, pendingMessage],
  )

  const lastMessageId = messages.at(-1)?.id
  const isOwnMessageLast = messages.at(-1)?.role === 'user'

  useEffect(() => {
    // Following the conversation is the default, but only for a reader who
    // has not gone looking through it -- which is the condition
    // `followIfPinned` checks for itself. The one exception is the reader's
    // own message: sending is an explicit act, and its answer belongs on
    // screen whether or not they had scrolled away.
    if (isOwnMessageLast) {
      scrollToBottom()
      return
    }

    followIfPinned()
  }, [
    followIfPinned,
    isOwnMessageLast,
    isSending,
    lastMessageId,
    scrollToBottom,
  ])

  // A conversation opens at its newest message, with no scroll animation
  // across a history the reader never saw.
  useLayoutEffect(() => {
    if (chat?.id) {
      scrollToBottom('auto')
    }
  }, [chat?.id, scrollToBottom])

  // The composer grows with the draft up to its cap, instead of hiding the
  // top of a long question behind a scrollbar in a four-line box.
  useLayoutEffect(() => {
    const textarea = composerRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`
  }, [composerValue])

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
          <div className="relative h-full">
            <ScrollArea
              className="h-full px-4 py-8 sm:px-6"
              viewportRef={viewportRef}
            >
              <div className="mx-auto w-full max-w-3xl space-y-6">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    documentDownloadError={documentDownloadErrors?.[message.id]}
                    isDownloadingDocument={
                      downloadingDocumentMessageIds?.has(message.id) ?? false
                    }
                    locale={locale}
                    message={message}
                    labels={messageLabels}
                    onDownloadDocument={onDownloadDocument}
                  />
                ))}

                {isSending ? (
                  <ChatActivity
                    events={progress.events}
                    fallbackLabel={messageLabels.sending}
                    formatElapsed={progress.formatElapsed}
                    formatEvent={progress.formatStep}
                    startedAt={progress.startedAt}
                    title={progress.title}
                  />
                ) : null}
              </div>
            </ScrollArea>

            {!isPinned ? (
              <Button
                aria-label={shellLabels.jumpToLatest}
                className="bg-card absolute bottom-4 left-1/2 h-9 -translate-x-1/2 rounded-full border shadow-lg"
                onClick={() => scrollToBottom()}
                size="sm"
                variant="outline"
              >
                <ArrowDown className="mr-1.5 h-4 w-4" />
                {shellLabels.jumpToLatest}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-4 pt-2 pb-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {errorMessage ? (
            <div className="mb-3 rounded-2xl border-destructive/25 bg-destructive/5 text-destructive border px-4 py-3 text-sm">
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
              ref={composerRef}
              disabled={composerDisabled}
              value={composerValue}
              onChange={(event) => onComposerChange(event.target.value)}
              onKeyDown={(event) => {
                // The send button is already disabled while a turn runs; the
                // keyboard has to refuse it too, or the same conversation gets
                // asked twice at once.
                if (composerDisabled || isSending) {
                  return
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  onSendMessage()
                }
              }}
              placeholder={composerPlaceholder}
              className="max-h-48 min-h-20 resize-none overflow-y-auto border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-between gap-3 px-1">
              <p className="text-muted-foreground hidden text-xs sm:block">
                <Kbd>Enter</Kbd> {shellLabels.sendHint}
                <span className="mx-1.5 opacity-50">·</span>
                <Kbd>Shift</Kbd> <Kbd>Enter</Kbd> {shellLabels.newLineHint}
              </p>
              {isSending && onStopGeneration ? (
                <Button
                  aria-label={shellLabels.stopGenerating}
                  className="h-10 w-10 shrink-0 rounded-full"
                  onClick={onStopGeneration}
                  size="icon"
                  title={shellLabels.stopGenerating}
                  variant="secondary"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="ml-auto h-10 w-10 shrink-0 rounded-full"
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Memoised on purpose: a turn reports its progress several times a second,
 * and every one of those re-rendered the whole conversation -- re-parsing the
 * markdown of every message already on screen. Nothing here depends on the
 * turn, so nothing here needs to run again while it is in flight.
 */
const MessageBubble = memo(function MessageBubble({
  documentDownloadError,
  isDownloadingDocument,
  locale,
  message,
  labels,
  onDownloadDocument,
}: Readonly<{
  documentDownloadError?: string
  isDownloadingDocument: boolean
  locale: AppLocale
  message: ChatMessage
  labels: ConversationViewProps['messageLabels']
  onDownloadDocument?: (message: ChatMessage) => void
}>) {
  const isUser = message.role === 'user'
  const authorLabel = isUser ? labels.user : labels.assistant
  const sources = getMessageSources(message)
  const generatedDocument = isUser ? null : getMessageDocument(message)

  return (
    <div
      className={cn(
        'group/message flex gap-3 sm:gap-4',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {!isUser ? <BubbleAvatar isUser={false} /> : null}
      <div
        className={cn(
          'min-w-0 rounded-3xl px-5 py-4 shadow-sm',
          // An answer carries tables, code and citations; boxing it at 85%
          // of the column squeezed all three for no reason. A question is a
          // line or two, and reads better as a bubble against the edge.
          isUser
            ? 'bg-primary text-primary-foreground max-w-[85%]'
            : 'bg-card w-full border',
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
            {authorLabel}
          </span>
          <span className="text-[11px] opacity-60">
            {formatMessageTimestamp(message.created_at, locale)}
          </span>
          <CopyButton
            className="-my-1 ml-auto opacity-0 transition-opacity group-hover/message:opacity-100 focus-visible:opacity-100"
            copiedLabel={labels.copiedMessage}
            copyLabel={labels.copyMessage}
            value={message.content}
          />
        </div>
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <MessageMarkdown
            content={message.content}
            copiedLabel={labels.copiedMessage}
            copyLabel={labels.copyMessage}
          />
        )}
        {generatedDocument ? (
          <GeneratedDocumentCard
            document={generatedDocument}
            downloadError={documentDownloadError}
            isDownloading={isDownloadingDocument}
            labels={labels}
            locale={locale}
            onDownload={
              onDownloadDocument ? () => onDownloadDocument(message) : undefined
            }
          />
        ) : null}
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
})

function GeneratedDocumentCard({
  document: generatedDocument,
  downloadError,
  isDownloading,
  labels,
  locale,
  onDownload,
}: Readonly<{
  document: ChatDocument
  downloadError?: string
  isDownloading: boolean
  labels: Pick<
    ConversationViewProps['messageLabels'],
    'document' | 'downloadDocument' | 'downloadingDocument'
  >
  locale: AppLocale
  onDownload?: () => void
}>) {
  const name = generatedDocument.title?.trim() || generatedDocument.filename

  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
        {labels.document}
      </p>
      {/* On a phone the button sits under the name rather than beside it:
          side by side, the name was left a few letters before the ellipsis.
          It wraps to two lines for the same reason, as file names are long. */}
      <div className="bg-muted/40 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="line-clamp-2 text-sm font-medium wrap-anywhere"
              title={name}
            >
              {name}
            </p>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span>{getDocumentFormatLabel(generatedDocument)}</span>
              <span>
                {formatDocumentSize(generatedDocument.size_bytes, locale)}
              </span>
            </p>
          </div>
        </div>
        <Button
          className="w-full shrink-0 rounded-2xl sm:w-auto"
          disabled={isDownloading || !onDownload}
          onClick={onDownload}
          size="sm"
          variant="outline"
        >
          {isDownloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isDownloading ? labels.downloadingDocument : labels.downloadDocument}
        </Button>
      </div>
      {downloadError ? (
        <p className="text-destructive mt-2 text-xs">{downloadError}</p>
      ) : null}
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
