import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import type { AppLocale } from '@/i18n/config'
import type { LogtoUser } from '@/lib/auth'
import { Settings2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import {
  useChatQuery,
  useChatsQuery,
  useCreateChatMutation,
  useSendMessageMutation,
  useSourcesStatusQuery,
  useVdbUpdateStatusQuery,
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
  const [sourcesOpen, setSourcesOpen] = useState(false)

  const chatsQuery = useChatsQuery()
  const sourcesQuery = useSourcesStatusQuery()
  const vdbStatusQuery = useVdbUpdateStatusQuery(user.role === 'admin')
  const effectiveChatId = selectedChatId ?? chatsQuery.data?.[0]?.id
  const chatQuery = useChatQuery(effectiveChatId)
  const createChatMutation = useCreateChatMutation()
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

  const pageError =
    chatsQuery.error ??
    chatQuery.error ??
    createChatMutation.error ??
    sourcesQuery.error
  const isBusy = createChatMutation.isPending || sendMessageMutation.isPending
  const chatEnabled = sourcesQuery.data?.can_chat ?? false
  const sourceSyncActive =
    user.role === 'admin' && (vdbStatusQuery.data?.active ?? false)
  const composerDisabled = !chatEnabled || sourceSyncActive
  const composerHint = !chatEnabled
    ? t('composer.disabledHint')
    : sourceSyncActive
      ? t('composer.finishSetupHint')
      : undefined
  const emptyTitle = !chatEnabled
    ? t('empty.gatedTitle')
    : sourceSyncActive
      ? t('empty.syncTitle')
      : t('empty.title')
  const emptyDescription = !chatEnabled
    ? t('empty.gatedDescription')
    : sourceSyncActive
      ? t('empty.syncDescription')
      : t('empty.description')
  const emptyPrimaryActionLabel =
    !chatEnabled || sourceSyncActive ? t('sources.openPanel') : undefined

  const handleCreateChat = async () => {
    setComposerError(undefined)
    const chat = await createChatMutation.mutateAsync(undefined)
    onSelectChat(chat.id)
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
      await sendMessageMutation.mutateAsync({ chatId: activeChatId, content })
      setPendingMessage(null)
    } catch (error) {
      setPendingMessage(null)
      setComposerValue(content)
      setComposerError(toErrorMessage(error, t('errors.sendFailed')))
    }
  }

  const retry = () => {
    chatsQuery.refetch()
    if (effectiveChatId) {
      chatQuery.refetch()
    }
  }

  return (
    <ChatShell
      closeSidebarLabel={t('shell.closeSidebar')}
      dashboardLabel={t('shell.dashboard')}
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
      title={t('shellTitle')}
      subtitle={t('shellSubtitle')}
      sidebar={
        <ChatSidebar
          activeChatId={effectiveChatId}
          chats={chatsQuery.data ?? []}
          emptyLabel={t('sidebar.emptyTitle')}
          emptyMessage={t('sidebar.emptyDescription')}
          isCreating={createChatMutation.isPending}
          isLoading={chatsQuery.isLoading}
          locale={locale}
          newChatLabel={t('sidebar.newChat')}
          onCreateChat={() => void handleCreateChat()}
          onSelectChat={(chatId) => onSelectChat(chatId)}
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
          title={getChatTitle(
            activeChat?.title,
            t('conversation.newChatTitle'),
          )}
          composerPlaceholder={t('composer.placeholder')}
          composerValue={composerValue}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyPrimaryActionLabel={emptyPrimaryActionLabel}
          errorMessage={composerError}
          isLoading={Boolean(effectiveChatId) && chatQuery.isLoading}
          isSending={isBusy}
          locale={locale}
          messageLabels={{
            assistant: t('messages.assistant'),
            openSource: t('messages.openSource'),
            sources: t('messages.sources'),
            sending: t('messages.sending'),
            user: t('messages.user'),
          }}
          onEmptyPrimaryAction={() => setSourcesOpen(true)}
          onComposerChange={setComposerValue}
          onSendMessage={() => void handleSendMessage()}
          pendingMessage={pendingMessage}
        />
      )}
    </ChatShell>
  )
}
