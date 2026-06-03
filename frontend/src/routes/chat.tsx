import { LoadingState } from '@/app/_components/metrics/loading-state'
import {
  hasGoogleDriveOAuthResponseParams,
  isGoogleDriveCallbackPath,
} from '@/features/chat/google-drive-auth'
import { useAuthenticatedUser } from '@/hooks/use-authenticated-user'
import {
  Navigate,
  Outlet,
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { Suspense, lazy, useCallback } from 'react'
import { z } from 'zod'

const ChatPage = lazy(() =>
  import('@/features/chat/chat-page').then((module) => ({
    default: module.ChatPage,
  })),
)

const chatSearchSchema = z.object({
  chatId: z.string().optional(),
})

export const Route = createFileRoute('/chat')({
  validateSearch: chatSearchSchema,
  component: ChatRoute,
})

function ChatRoute() {
  const navigate = useNavigate({ from: '/chat' })
  const location = useLocation()
  const search = Route.useSearch()
  const { isAuthenticated, isLoading, user } = useAuthenticatedUser()
  const callbackSearchParams = new URLSearchParams(globalThis.location.search)

  const handleSelectChat = useCallback(
    (chatId?: string, options?: { replace?: boolean }) => {
      void navigate({
        search: chatId ? { chatId } : {},
        replace: options?.replace ?? false,
      })
    },
    [navigate],
  )

  if (isGoogleDriveCallbackPath(location.pathname)) {
    return <Outlet />
  }

  if (hasGoogleDriveOAuthResponseParams(callbackSearchParams)) {
    return (
      <Navigate
        to="/chat/provider-callback"
        search={{
          code: callbackSearchParams.get('code') ?? undefined,
          error: callbackSearchParams.get('error') ?? undefined,
          error_description:
            callbackSearchParams.get('error_description') ?? undefined,
          state: callbackSearchParams.get('state') ?? undefined,
        }}
        replace
      />
    )
  }

  if ((isLoading && !user) || (isAuthenticated && !user)) {
    return (
      <div className="h-screen p-4 sm:p-6 lg:p-8">
        <LoadingState />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/sign-in" search={{ returnTo: '/chat' }} replace />
  }

  return (
    <Suspense
      fallback={
        <div className="h-screen p-4 sm:p-6 lg:p-8">
          <LoadingState />
        </div>
      }
    >
      <ChatPage
        user={user}
        selectedChatId={search.chatId}
        onSelectChat={handleSelectChat}
      />
    </Suspense>
  )
}
