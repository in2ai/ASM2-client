import { LoadingState } from '@/app/_components/metrics/loading-state'
import { ErrorState } from '@/components/error-state'
import { useAuthorizedChatRequest } from '@/features/chat/api'
import {
  clearDropboxOAuthRequest,
  readDropboxOAuthRequest,
} from '@/features/chat/dropbox-auth'
import {
  clearGoogleDriveOAuthRequest,
  readGoogleDriveOAuthRequest,
} from '@/features/chat/google-drive-auth'
import type { SourceProviderKey } from '@/features/chat/types'
import { useLogto } from '@logto/react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

const callbackSearchSchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  state: z.string().optional(),
})

export const Route = createFileRoute('/chat/provider-callback')({
  validateSearch: callbackSearchSchema,
  component: ProviderCallbackRoute,
})

interface MatchedProviderRequest {
  clear: () => void
  displayName: string
  redirectUri: string
  returnTo: string
  source: SourceProviderKey
}

// The callback path is shared by every provider's redirect_uri, so on return
// the only way to tell which one sent us here is to see whose stored state
// (written when the connect button was clicked) matches what came back.
function resolveProviderRequest(
  state: string | undefined,
): MatchedProviderRequest | null {
  if (!state) {
    return null
  }

  const driveRequest = readGoogleDriveOAuthRequest()
  if (driveRequest?.state === state) {
    return {
      ...driveRequest,
      clear: clearGoogleDriveOAuthRequest,
      displayName: 'Google Drive',
      source: 'drive',
    }
  }

  const dropboxRequest = readDropboxOAuthRequest()
  if (dropboxRequest?.state === state) {
    return {
      ...dropboxRequest,
      clear: clearDropboxOAuthRequest,
      displayName: 'Dropbox',
      source: 'dropbox',
    }
  }

  return null
}

function clearAllProviderRequests() {
  clearGoogleDriveOAuthRequest()
  clearDropboxOAuthRequest()
}

type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string

type CallbackOutcome =
  | { kind: 'error'; message: string }
  | { kind: 'proceed'; authCode: string; match: MatchedProviderRequest }

interface CallbackSearch {
  code?: string
  error?: string
  error_description?: string
  state?: string
}

// Priority mirrors the original single-provider flow: an explicit provider
// error wins, then a missing code, then an unresolvable/expired state. Only
// the last case is truly provider-agnostic (we never matched a stored
// request), so it's the only one that skips the {provider} wording.
function resolveCallbackOutcome(
  search: CallbackSearch,
  t: TranslateFn,
): CallbackOutcome {
  const matched = resolveProviderRequest(search.state)
  const providerLabel = matched?.displayName

  if (search.error) {
    return {
      kind: 'error',
      message:
        search.error_description ??
        (providerLabel
          ? t('sources.callbackCancelled', { provider: providerLabel })
          : t('sources.callbackInvalidState')),
    }
  }

  if (!search.code || !search.state) {
    return {
      kind: 'error',
      message: providerLabel
        ? t('sources.callbackMissingCode', { provider: providerLabel })
        : t('sources.callbackInvalidState'),
    }
  }

  if (!matched) {
    return { kind: 'error', message: t('sources.callbackInvalidState') }
  }

  return { kind: 'proceed', authCode: search.code, match: matched }
}

function ProviderCallbackRoute() {
  const search = Route.useSearch()
  const t = useTranslations('ChatPage')
  const { isLoading } = useLogto()
  const request = useAuthorizedChatRequest()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [callbackError, setCallbackError] = useState<string | null>(null)
  const hasStartedRef = useRef(false)
  const didUnmountRef = useRef(false)

  useEffect(() => {
    didUnmountRef.current = false

    return () => {
      didUnmountRef.current = true
    }
  }, [])

  useEffect(() => {
    if (isLoading || hasStartedRef.current) {
      return
    }

    const outcome = resolveCallbackOutcome(search, t)

    if (outcome.kind === 'error') {
      clearAllProviderRequests()
      if (!didUnmountRef.current) {
        setCallbackError(outcome.message)
      }
      return
    }

    const { authCode, match } = outcome
    hasStartedRef.current = true
    setIsSubmitting(true)

    void (async () => {
      try {
        await request<void>('/login-source', {
          body: JSON.stringify({
            source: match.source,
            payload: {
              auth_token: authCode,
              redirect_uri: match.redirectUri,
            },
          }),
          method: 'POST',
        })
        if (!didUnmountRef.current) {
          match.clear()
          globalThis.location.replace(match.returnTo)
        }
      } catch (error: unknown) {
        hasStartedRef.current = false
        if (!didUnmountRef.current) {
          setIsSubmitting(false)
          setCallbackError(
            error instanceof Error
              ? error.message
              : t('sources.callbackExchangeFailed', {
                  provider: match.displayName,
                }),
          )
        }
      }
    })()
  }, [
    isLoading,
    request,
    search.code,
    search.error,
    search.error_description,
    search.state,
    t,
  ])

  if (isLoading || isSubmitting) {
    return (
      <div className="h-screen p-4 sm:p-6 lg:p-8">
        <LoadingState />
      </div>
    )
  }

  if (callbackError) {
    return (
      <div className="h-screen p-4 sm:p-6 lg:p-8">
        <ErrorState
          title={t('sources.callbackFailedTitle')}
          message={callbackError}
          showHomeButton
        />
      </div>
    )
  }

  return (
    <div className="h-screen p-4 sm:p-6 lg:p-8">
      <LoadingState />
    </div>
  )
}
