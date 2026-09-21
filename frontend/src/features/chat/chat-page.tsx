import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import type { AppLocale } from '@/i18n/config'
import type { LogtoUser } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import {
  chatQueryKeys,
  useChatQuery,
  useChatsQuery,
  useCreateChatMutation,
  useDeleteChatMutation,
  useDownloadDocumentMutation,
  useRenameChatMutation,
  useSendMessageMutation,
  useSetChatArchivedMutation,
  useSetChatPinnedMutation,
  useSourcesStatusQuery,
} from './api'
import { getMessageDocument } from './chat-document'
import { appendProgress, describeProgress } from './chat-progress'
import { UnfinishedTurnError } from './chat-stream'
import { ChatShell } from './chat-shell'
import { ChatSidebar } from './chat-sidebar'
import { ConversationView } from './conversation-view'
import { SourcesPanel } from './sources-panel'
import type { ChatMessage, ChatProgressEvent } from './types'
import { getChatTitle, toErrorMessage } from './utils'

function omitKey(source: Record<string, string>, key: string) {
  if (!(key in source)) {
    return source
  }

  const { [key]: _removed, ...rest } = source
  return rest
}

interface ChatPageProps {
  onSelectChat: (chatId?: string, options?: { replace?: boolean }) => void
  selectedChatId?: string
  user: LogtoUser
}

export function ChatPage({
  onSelectChat,
  selectedChatId,
  user,
}: Readonly<ChatPageProps>) {
  const t = useTranslations('ChatPage')
  const locale = useLocale() as AppLocale
  const [composerValue, setComposerValue] = useState('')
  const [composerError, setComposerError] = useState<string | undefined>()
  const [pendingMessage, setPendingMessage] = useState<ChatMessage | null>(null)
  const [progressEvents, setProgressEvents] = useState<ChatProgressEvent[]>([])
  const [sendingChatId, setSendingChatId] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [documentDownloadErrors, setDocumentDownloadErrors] = useState<
    Record<string, string>
  >({})
  const [downloadingDocumentIds, setDownloadingDocumentIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const [showArchived, setShowArchived] = useState(false)

  const queryClient = useQueryClient()
  const chatsQuery = useChatsQuery(showArchived)
  const sourcesQuery = useSourcesStatusQuery()
  const effectiveChatId = selectedChatId ?? chatsQuery.data?.[0]?.id
  const chatQuery = useChatQuery(effectiveChatId)
  const createChatMutation = useCreateChatMutation()
  const deleteChatMutation = useDeleteChatMutation()
  const renameChatMutation = useRenameChatMutation()
  const setChatPinnedMutation = useSetChatPinnedMutation()
  const setChatArchivedMutation = useSetChatArchivedMutation()
  const sendMessageMutation = useSendMessageMutation()
  const downloadDocumentMutation = useDownloadDocumentMutation()

  useEffect(() => {
    // The archived list is a place to tidy up, not a conversation to fall into.
    if (!selectedChatId && !showArchived && chatsQuery.data?.[0]?.id) {
      onSelectChat(chatsQuery.data[0].id, { replace: true })
    }
  }, [chatsQuery.data, onSelectChat, selectedChatId, showArchived])

  const activeChat = useMemo(() => {
    if (chatQuery.data) {
      return chatQuery.data
    }

    if (createChatMutation.data?.id === effectiveChatId) {
      return createChatMutation.data
    }

    return undefined
  }, [chatQuery.data, createChatMutation.data, effectiveChatId])

  const visibleConversationId =
    activeChat?.id ?? effectiveChatId ?? createChatMutation.data?.id
  const lastPersistedMessage = activeChat?.messages.at(-1)
  const hasPersistedPendingMessage =
    pendingMessage != null &&
    lastPersistedMessage?.role === 'user' &&
    lastPersistedMessage.content === pendingMessage.content
  const visiblePendingMessage =
    pendingMessage?.chat_id === visibleConversationId &&
    !hasPersistedPendingMessage
      ? pendingMessage
      : null
  const isSendingActiveConversation =
    sendMessageMutation.isPending && sendingChatId === visibleConversationId

  const pageError =
    chatsQuery.error ??
    chatQuery.error ??
    createChatMutation.error ??
    deleteChatMutation.error ??
    sourcesQuery.error
  const sourcesStatus = sourcesQuery.data
  const hasSelectedSource = (sourcesStatus?.selected_sources?.length ?? 0) > 0
  const vdbIndexingActive = sourcesStatus?.vdb_indexing_active ?? false
  const chatEnabled = sourcesStatus?.can_chat ?? false
  const setupInProgress = hasSelectedSource && vdbIndexingActive && !chatEnabled
  const composerDisabled = !chatEnabled

  let composerHint: string | undefined
  if (!chatEnabled && sourcesStatus) {
    if (!hasSelectedSource) {
      composerHint = t('composer.disabledHint')
    } else if (setupInProgress) {
      composerHint = t('composer.finishSetupHint')
    } else if (!vdbIndexingActive) {
      composerHint =
        user.role === 'admin'
          ? t('composer.disabledHintIndexingInactiveAdmin')
          : t('composer.disabledHintIndexingInactiveUser')
    }
  }

  let emptyTitle: string
  let emptyDescription: string
  let emptyPrimaryActionLabel: string | undefined

  if (!chatEnabled) {
    emptyPrimaryActionLabel = t('sources.openPanel')
    if (setupInProgress) {
      emptyTitle = t('empty.syncTitle')
      emptyDescription = t('empty.syncDescription')
    } else if (sourcesStatus && hasSelectedSource && !vdbIndexingActive) {
      emptyTitle = t('empty.indexingInactiveTitle')
      emptyDescription =
        user.role === 'admin'
          ? t('empty.indexingInactiveDescriptionAdmin')
          : t('empty.indexingInactiveDescriptionUser')
    } else {
      emptyTitle = t('empty.gatedTitle')
      emptyDescription = t('empty.gatedDescription')
    }
  } else {
    emptyTitle = t('empty.title')
    emptyDescription = t('empty.description')
    emptyPrimaryActionLabel = undefined
  }

  let updatingChatId: string | undefined
  if (setChatPinnedMutation.isPending) {
    updatingChatId = setChatPinnedMutation.variables?.chatId
  } else if (setChatArchivedMutation.isPending) {
    updatingChatId = setChatArchivedMutation.variables?.chatId
  }

  const handleCreateChat = async () => {
    setComposerError(undefined)
    const chat = await createChatMutation.mutateAsync(undefined)
    onSelectChat(chat.id)
  }

  const handleDeleteChat = async (chatId: string) => {
    setComposerError(undefined)
    const nextChatId =
      effectiveChatId === chatId
        ? chatsQuery.data?.find((chat) => chat.id !== chatId)?.id
        : undefined

    try {
      await deleteChatMutation.mutateAsync(chatId)

      if (effectiveChatId === chatId) {
        onSelectChat(nextChatId, { replace: true })
      }
    } catch (error) {
      setComposerError(toErrorMessage(error, t('errors.deleteFailed')))
    }
  }

  const handleSetChatPinned = async (chatId: string, pinned: boolean) => {
    setComposerError(undefined)

    try {
      await setChatPinnedMutation.mutateAsync({ chatId, pinned })
    } catch (error) {
      setComposerError(toErrorMessage(error, t('errors.pinFailed')))
    }
  }

  const handleSetChatArchived = async (chatId: string, archived: boolean) => {
    setComposerError(undefined)
    // Archiving takes the chat out of the list on screen, so the pane it was
    // filling has to move on to a chat that is still there.
    const nextChatId =
      effectiveChatId === chatId
        ? chatsQuery.data?.find((chat) => chat.id !== chatId)?.id
        : undefined

    try {
      await setChatArchivedMutation.mutateAsync({ archived, chatId })

      if (effectiveChatId === chatId) {
        onSelectChat(nextChatId, { replace: true })
      }
    } catch (error) {
      setComposerError(
        toErrorMessage(
          error,
          archived ? t('errors.archiveFailed') : t('errors.unarchiveFailed'),
        ),
      )
    }
  }

  const handleRenameChat = async (chatId: string, title: string) => {
    setComposerError(undefined)

    try {
      await renameChatMutation.mutateAsync({ chatId, title })
    } catch (error) {
      setComposerError(toErrorMessage(error, t('errors.renameFailed')))
    }
  }

  const handleDownloadDocument = async (message: ChatMessage) => {
    const generatedDocument = getMessageDocument(message)

    if (!generatedDocument) {
      return
    }

    setDocumentDownloadErrors((current) => omitKey(current, message.id))
    setDownloadingDocumentIds((current) => new Set(current).add(message.id))

    try {
      await downloadDocumentMutation.mutateAsync({
        chatId: message.chat_id,
        filename: generatedDocument.filename,
        messageId: message.id,
      })
    } catch (error) {
      setDocumentDownloadErrors((current) => ({
        ...current,
        [message.id]: toErrorMessage(error, t('errors.downloadFailed')),
      }))
    } finally {
      setDownloadingDocumentIds((current) => {
        const next = new Set(current)
        next.delete(message.id)
        return next
      })
    }
  }

  const handleSendMessage = async () => {
    const content = composerValue.trim()
    if (!content || !chatEnabled) {
      return
    }

    setComposerError(undefined)
    let activeChatId = effectiveChatId

    try {
      if (!activeChatId) {
        const chat = await createChatMutation.mutateAsync(undefined)
        activeChatId = chat.id
        onSelectChat(chat.id)
      }

      setSendingChatId(activeChatId)

      const optimisticMessage: ChatMessage = {
        chat_id: activeChatId,
        content,
        created_at: new Date().toISOString(),
        id: `pending-${Date.now()}`,
        metadata: null,
        role: 'user',
        status: 'sending',
      }

      setComposerValue('')
      setPendingMessage(optimisticMessage)
      setProgressEvents([])

      const result = await sendMessageMutation.mutateAsync({
        chatId: activeChatId,
        content,
        onProgress: (event) =>
          setProgressEvents((current) => appendProgress(current, event)),
      })

      setPendingMessage(null)
      queryClient.setQueryData(chatQueryKeys.detail(activeChatId), result.chat)
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.list })
    } catch (error) {
      setPendingMessage(null)

      // A turn the backend kept working on after the connection broke may have
      // been answered anyway, so ask it rather than assume the message is lost.
      if (error instanceof UnfinishedTurnError && activeChatId) {
        setComposerError(t('errors.turnInterrupted'))
        await queryClient.invalidateQueries({
          queryKey: chatQueryKeys.detail(activeChatId),
        })
      } else {
        setComposerValue(content)
        setComposerError(toErrorMessage(error, t('errors.sendFailed')))
      }
    } finally {
      setSendingChatId((current) => (current === activeChatId ? null : current))
    }
  }

  const retry = () => {
    void chatsQuery.refetch()
    if (effectiveChatId) {
      void chatQuery.refetch()
    }
    void sourcesQuery.refetch()
  }

  const conversationTitle = getChatTitle(
    activeChat?.title,
    t('conversation.newChatTitle'),
  )

  return (
    <ChatShell
      closeSidebarLabel={t('shell.closeSidebar')}
      headerActions={
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => setSourcesOpen(true)}
        >
          <Settings2 className="mr-2 h-4 w-4" />
          {t('sources.openPanel')}
        </Button>
      }
      openSidebarLabel={t('shell.openSidebar')}
      user={user}
      title={conversationTitle}
      sidebar={
        <ChatSidebar
          activeChatId={effectiveChatId}
          archiveChatLabel={t('sidebar.archiveChat')}
          archivedEmptyDescription={t('sidebar.archivedEmptyDescription')}
          archivedEmptyTitle={t('sidebar.archivedEmptyTitle')}
          archivedTitle={t('sidebar.archivedTitle')}
          backToChatsLabel={t('sidebar.backToChats')}
          chats={chatsQuery.data ?? []}
          confirmDeleteActionLabel={t('sidebar.confirmDeleteAction')}
          confirmDeleteCancelLabel={t('sidebar.confirmDeleteCancel')}
          confirmDeleteDescription={t('sidebar.confirmDeleteDescription')}
          confirmDeleteTitle={t('sidebar.confirmDeleteTitle')}
          deleteChatLabel={t('sidebar.deleteChat')}
          deletingChatId={
            deleteChatMutation.isPending
              ? deleteChatMutation.variables
              : undefined
          }
          emptyLabel={t('sidebar.emptyTitle')}
          emptyMessage={t('sidebar.emptyDescription')}
          isCreating={createChatMutation.isPending}
          isLoading={chatsQuery.isLoading}
          locale={locale}
          newChatLabel={t('sidebar.newChat')}
          onCreateChat={() => void handleCreateChat()}
          onDeleteChat={(chatId) => void handleDeleteChat(chatId)}
          onRenameChat={(chatId, title) => void handleRenameChat(chatId, title)}
          onSelectChat={(chatId) => onSelectChat(chatId)}
          onSetChatArchived={(chatId, archived) =>
            void handleSetChatArchived(chatId, archived)
          }
          onSetChatPinned={(chatId, pinned) =>
            void handleSetChatPinned(chatId, pinned)
          }
          onShowArchivedChange={setShowArchived}
          pinChatLabel={t('sidebar.pinChat')}
          pinnedSectionLabel={t('sidebar.pinnedSection')}
          recentSectionLabel={t('sidebar.recentSection')}
          renameCancelLabel={t('sidebar.renameCancel')}
          renameChatLabel={t('sidebar.renameChat')}
          renameDescription={t('sidebar.renameDescription')}
          renameFieldLabel={t('sidebar.renameFieldLabel')}
          renameSaveLabel={t('sidebar.renameAction')}
          renameTitle={t('sidebar.renameTitle')}
          renamingChatId={
            renameChatMutation.isPending
              ? renameChatMutation.variables?.chatId
              : undefined
          }
          rowActionsLabel={t('sidebar.rowActions')}
          showArchived={showArchived}
          unarchiveChatLabel={t('sidebar.unarchiveChat')}
          unpinChatLabel={t('sidebar.unpinChat')}
          updatingChatId={updatingChatId}
          viewArchivedLabel={t('sidebar.viewArchived')}
        />
      }
    >
      <SourcesPanel
        isAdmin={user.role === 'admin'}
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        status={sourcesQuery.data}
      />
      {pageError ? (
        <div className="p-4 sm:p-6">
          <ErrorState
            title={t('errors.title')}
            message={toErrorMessage(pageError, t('errors.loadFailed'))}
            onRetry={retry}
            isRetrying={chatsQuery.isRefetching || chatQuery.isRefetching}
          />
        </div>
      ) : (
        <ConversationView
          chat={activeChat}
          composerDisabled={composerDisabled}
          composerHint={composerHint}
          composerPlaceholder={t('composer.placeholder')}
          composerValue={composerValue}
          documentDownloadErrors={documentDownloadErrors}
          downloadingDocumentMessageIds={downloadingDocumentIds}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyPrimaryActionLabel={emptyPrimaryActionLabel}
          errorMessage={composerError}
          isLoading={Boolean(effectiveChatId) && chatQuery.isLoading}
          isSending={isSendingActiveConversation}
          locale={locale}
          messageLabels={{
            assistant: t('messages.assistant'),
            document: t('messages.document'),
            downloadDocument: t('messages.downloadDocument'),
            downloadingDocument: t('messages.downloadingDocument'),
            openSource: t('messages.openSource'),
            page: t('messages.page'),
            pages: t('messages.pages'),
            sources: t('messages.sources'),
            sending: t('messages.sending'),
            user: t('messages.user'),
          }}
          onDownloadDocument={(message) => void handleDownloadDocument(message)}
          onEmptyPrimaryAction={() => setSourcesOpen(true)}
          onComposerChange={setComposerValue}
          onSendMessage={() => void handleSendMessage()}
          pendingMessage={visiblePendingMessage}
          progress={{
            events: progressEvents,
            formatElapsed: (seconds) => t('progress.elapsed', { seconds }),
            formatStep: (event) => {
              const { key, values } = describeProgress(event)
              return t(key, values)
            },
            title: t('progress.title'),
          }}
        />
      )}
    </ChatShell>
  )
}
