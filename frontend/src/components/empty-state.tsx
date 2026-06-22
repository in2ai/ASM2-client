import {
  Database,
  FileQuestion,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface EmptyStateProps {
  title?: string
  message: string
  icon?: LucideIcon
  actionLabel?: string
  onAction?: () => void
  isActionLoading?: boolean
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  showTips?: boolean
  tips?: string[]
}

export function EmptyState({
  title,
  message,
  icon: Icon = FileQuestion,
  actionLabel,
  onAction,
  isActionLoading = false,
  secondaryActionLabel,
  onSecondaryAction,
  showTips = false,
  tips,
}: Readonly<EmptyStateProps>) {
  const t = useTranslations('EmptyState')
  const resolvedTitle = title ?? t('defaultTitle')
  const resolvedTips = tips ?? [
    t('defaultTips.connection'),
    t('defaultTips.seed'),
    t('defaultTips.filters'),
    t('defaultTips.dateRange'),
  ]

  return (
    <Card className="border-muted bg-muted/5 mx-auto max-w-3xl">
      <CardHeader className="pb-4 text-center sm:pb-6">
        <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full sm:h-20 sm:w-20">
          <Icon className="text-muted-foreground h-8 w-8 sm:h-10 sm:w-10" />
        </div>
        <CardTitle className="text-xl sm:text-2xl">{resolvedTitle}</CardTitle>
        <CardDescription className="mx-auto mt-2 max-w-md text-sm sm:text-base">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {(onAction != null || onSecondaryAction != null) && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {onAction && actionLabel && (
              <Button
                onClick={onAction}
                disabled={isActionLoading}
                className="min-h-11 w-full gap-2 sm:w-auto"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isActionLoading ? 'animate-spin' : ''}`}
                />
                {isActionLoading ? t('loading') : actionLabel}
              </Button>
            )}
            {onSecondaryAction && secondaryActionLabel && (
              <Button
                onClick={onSecondaryAction}
                variant="outline"
                className="min-h-11 w-full gap-2 sm:w-auto"
              >
                <Database className="h-4 w-4" />
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )}

        {showTips && resolvedTips.length > 0 && (
          <div className="bg-card rounded-lg border p-4 sm:p-6">
            <p className="mb-3 text-sm font-medium sm:text-base">
              {t('helpfulTips')}
            </p>
            <ul className="text-muted-foreground space-y-2 text-sm sm:text-base">
              {resolvedTips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="bg-muted-foreground mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function NoMetricsEmptyState({
  onRefresh,
  isRefreshing = false,
}: Readonly<{
  onRefresh?: () => void
  isRefreshing?: boolean
}>) {
  const t = useTranslations('EmptyState.noMetrics')

  return (
    <EmptyState
      title={t('title')}
      message={t('message')}
      icon={Database}
      actionLabel={t('refresh')}
      onAction={onRefresh}
      isActionLoading={isRefreshing}
      showTips={true}
      tips={[
        t('tips.adjustDateRange'),
        t('tips.widerRange'),
        t('tips.selectDifferentNode'),
        t('tips.seedData'),
      ]}
    />
  )
}

export function NoNodesEmptyState({
  onRefresh,
  isRefreshing = false,
}: Readonly<{
  onRefresh?: () => void
  isRefreshing?: boolean
}>) {
  const t = useTranslations('EmptyState.noNodes')

  return (
    <EmptyState
      title={t('title')}
      message={t('message')}
      icon={Database}
      actionLabel={t('refresh')}
      onAction={onRefresh}
      isActionLoading={isRefreshing}
      showTips={true}
      tips={[
        t('tips.setupScript'),
        t('tips.logtoOrganizations'),
        t('tips.contactAdmin'),
      ]}
    />
  )
}
