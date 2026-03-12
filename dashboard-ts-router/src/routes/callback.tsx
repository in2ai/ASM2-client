import { useHandleSignInCallback, useLogto } from '@logto/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { API_RESOURCE, BACKEND_URL } from '@/lib/api'

export const Route = createFileRoute('/callback')({
  component: CallbackPage,
})

function CallbackPage() {
  const navigate = useNavigate()
  const { getAccessToken } = useLogto()

  const bootstrapUser = async () => {
    const returnTo = sessionStorage.getItem('dashboard:returnTo') || '/'
    sessionStorage.removeItem('dashboard:returnTo')

    try {
      const token = await getAccessToken(API_RESOURCE)
      const response = await fetch(`${BACKEND_URL}/auth/bootstrap`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Bootstrap failed with status ${response.status}`)
      }

      const payload = (await response.json()) as {
        refresh_required?: boolean
      }

      if (payload.refresh_required) {
        await getAccessToken(API_RESOURCE)
      }
    } catch (error) {
      console.error('Role bootstrap error:', error)
    }

    await navigate({ to: returnTo })
  }

  const { isLoading } = useHandleSignInCallback(() => {
    void bootstrapUser()
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Redirecting...</p>
      </div>
    )
  }

  return null
}
