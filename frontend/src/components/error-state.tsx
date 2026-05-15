import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface ErrorStateProps {
  message: string
  title?: string
  onRetry?: () => void
  isRetrying?: boolean
  onGoHome?: () => void
  showHomeButton?: boolean
}

export function ErrorState({
  message,
  title,
  onRetry,
  isRetrying = false,
  onGoHome,
  showHomeButton = false,
}: Readonly<ErrorStateProps>) {
  const t = useTranslations('ErrorState')
  const resolvedTitle = title ?? t('defaultTitle')

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <Card className="border-destructive/40 bg-destructive/5 mx-auto max-w-3xl">
      <CardHeader className="pb-4 sm:pb-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="bg-destructive/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12">
            <AlertCircle className="text-destructive h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg sm:text-xl">{resolvedTitle}</CardTitle>
            <CardDescription className="mt-1.5 text-sm sm:text-base">
              {message}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onRetry && (
            <Button
              variant="outline"
              onClick={onRetry}
              disabled={isRetrying}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? t('retrying') : t('retry')}
            </Button>
          )}
          {showHomeButton && (
            <Button
              variant="ghost"
              onClick={handleGoHome}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <Home className="h-4 w-4" />
              {t('goHome')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
