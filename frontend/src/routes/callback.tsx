import { useHandleSignInCallback } from '@logto/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/callback')({
  component: CallbackPage,
})

function CallbackPage() {
  const navigate = useNavigate()

  const finishSignIn = async () => {
    const returnTo = sessionStorage.getItem('dashboard:returnTo') || '/'
    sessionStorage.removeItem('dashboard:returnTo')

    await navigate({ to: returnTo })
  }

  const { isLoading } = useHandleSignInCallback(() => {
    finishSignIn()
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
