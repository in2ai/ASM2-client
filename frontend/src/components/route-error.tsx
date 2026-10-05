import { ErrorState } from '@/components/error-state'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { useTranslations } from 'next-intl'

/**
 * What a route shows when its tree throws.
 *
 * Without one of these a render error unmounted everything and left a white
 * page -- no message, no way back, and nothing on screen to suggest reloading
 * would help.
 */
export function RouteError({ error, reset }: Readonly<ErrorComponentProps>) {
  const t = useTranslations('ErrorState')
  const router = useRouter()

  const handleRetry = () => {
    // Clearing the boundary alone re-renders the same failed tree. Reloading
    // the route's data first is what gives the retry something to succeed on.
    reset()
    void router.invalidate()
  }

  return (
    <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
      <ErrorState
        message={error instanceof Error ? error.message : t('unexpected')}
        onRetry={handleRetry}
        showHomeButton
        title={t('crashTitle')}
      />
    </div>
  )
}
