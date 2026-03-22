import { useEffect, useRef, useState } from 'react'

import { useLogto } from '@logto/react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslations } from 'next-intl'
import { z } from 'zod'

import { LoadingState } from '@/app/_components/metrics/loading-state'
import { ErrorState } from '@/components/error-state'

import { useAuthorizedChatRequest } from '@/features/chat/api'
import {
  clearGoogleDriveOAuthRequest,
  readGoogleDriveOAuthRequest,
} from '@/features/chat/google-drive-auth'

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
    return () => {
      didUnmountRef.current = true
    }
  }, [])

  useEffect(() => {
    if (isLoading || hasStartedRef.current) {
      return
    }

    if (search.error) {
      clearGoogleDriveOAuthRequest()
      if (!didUnmountRef.current) {
        setCallbackError(
          search.error_description ?? t('sources.callbackCancelled'),
        )
      }
      return
    }

    if (!search.code || !search.state) {
      clearGoogleDriveOAuthRequest()
      if (!didUnmountRef.current) {
        setCallbackError(t('sources.callbackMissingCode'))
      }
      return
    }

    const storedRequest = readGoogleDriveOAuthRequest()
    if (!storedRequest || storedRequest.state !== search.state) {
      clearGoogleDriveOAuthRequest()
      if (!didUnmountRef.current) {
        setCallbackError(t('sources.callbackInvalidState'))
      }
      return
    }

    hasStartedRef.current = true
    setIsSubmitting(true)

    void (async () => {
      try {
        await request<{ success: boolean; message: string }>(
          '/sources/drive/connect',
          {
            body: JSON.stringify({
              code: search.code,
              redirect_uri: storedRequest.redirectUri,
            }),
            method: 'POST',
          },
        )
        if (!didUnmountRef.current) {
          clearGoogleDriveOAuthRequest()
          globalThis.location.replace(storedRequest.returnTo)
        }
      } catch (error: unknown) {
        hasStartedRef.current = false
        if (!didUnmountRef.current) {
          setIsSubmitting(false)
          setCallbackError(
            error instanceof Error
              ? error.message
              : t('sources.callbackExchangeFailed'),
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
