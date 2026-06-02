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
  useSendMessageMutation,
  useSourcesStatusQuery,
} from './api'
import { ChatShell } from './chat-shell'
import { ChatSidebar } from './chat-sidebar'
import { ConversationView } from './conversation-view'
import { SourcesPanel } from './sources-panel'
import type { ChatMessage } from './types'
import { getChatTitle, toErrorMessage } from './utils'

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
  const [sendingChatId, setSendingChatId] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const queryClient = useQueryClient()
  const chatsQuery = useChatsQuery()
  const sourcesQuery = useSourcesStatusQuery()
  const effectiveChatId = selectedChatId ?? chatsQuery.data?.[0]?.id
  const chatQuery = useChatQuery(effectiveChatId)
  const createChatMutation = useCreateChatMutation()
  const deleteChatMutation = useDeleteChatMutation()
  const sendMessageMutation = useSendMessageMutation()

  useEffect(() => {
    if (!selectedChatId && chatsQuery.data?.[0]?.id) {
      onSelectChat(chatsQuery.data[0].id, { replace: true })
    }
  }, [chatsQuery.data, onSelectChat, selectedChatId])

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
  const composerDisabled = !chatEnabled

  let composerHint: string | undefined
  if (!chatEnabled && sourcesStatus) {
    if (!hasSelectedSource) {
      composerHint = t('composer.disabledHint')
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
    if (sourcesStatus && !vdbIndexingActive) {
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
      const result = await sendMessageMutation.mutateAsync({
        chatId: activeChatId,
        content,
      })

      setPendingMessage(null)
      queryClient.setQueryData(chatQueryKeys.detail(activeChatId), result.chat)
      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.list })
    } catch (error) {
      setPendingMessage(null)
      setComposerValue(content)
      setComposerError(toErrorMessage(error, t('errors.sendFailed')))
    } finally {
      setSendingChatId((current) => (current === activeChatId ? null : current))
    }
  }

  const retry = () => {
    chatsQuery.refetch()
    if (effectiveChatId) {
      chatQuery.refetch()
    }
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
          onSelectChat={(chatId) => onSelectChat(chatId)}
          rowActionsLabel={t('sidebar.rowActions')}
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
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyPrimaryActionLabel={emptyPrimaryActionLabel}
          errorMessage={composerError}
          isLoading={Boolean(effectiveChatId) && chatQuery.isLoading}
          isSending={isSendingActiveConversation}
          locale={locale}
          messageLabels={{
            assistant: t('messages.assistant'),
            openSource: t('messages.openSource'),
            page: t('messages.page'),
            pages: t('messages.pages'),
            sources: t('messages.sources'),
            sending: t('messages.sending'),
            user: t('messages.user'),
          }}
          onEmptyPrimaryAction={() => setSourcesOpen(true)}
          onComposerChange={setComposerValue}
          onSendMessage={() => void handleSendMessage()}
          pendingMessage={visiblePendingMessage}
        />
      )}
    </ChatShell>
  )
}
