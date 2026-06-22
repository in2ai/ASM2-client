import { Loader2, RefreshCw } from 'lucide-react'
import { type DateRange } from 'react-day-picker'
import { useLocale, useTranslations } from 'next-intl'

import { DateRangeSelector } from '@/components/date-range-selector'
import { ExportButton } from '@/components/export-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type StatsResponse } from './types'

interface PersistentHeaderProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  lastUpdated: string | undefined
  stats: StatsResponse | undefined
  isFetching: boolean
  onRefresh: () => void
}

export function PersistentHeader({
  dateRange,
  onDateRangeChange,
  lastUpdated,
  stats,
  isFetching,
  onRefresh,
}: Readonly<PersistentHeaderProps>) {
  const t = useTranslations('PersistentHeader')
  const locale = useLocale()

  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8">
      <div className="bg-card/60 border-border/50 relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        {isFetching ? (
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden">
            <div className="from-primary/20 via-primary to-primary/20 h-full w-1/3 animate-[dashboard-progress_1.4s_ease-in-out_infinite] rounded-full bg-linear-to-r" />
          </div>
        ) : null}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">{t('title')}</h2>
            {isFetching && (
              <Badge
                variant="secondary"
                className="animate-pulse gap-1 shadow-sm"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('updating')}
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              {lastUpdated
                ? t('updatedAt', { value: lastUpdated })
                : t('updatedNow')}
            </div>
            {stats && (
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                {t('records', {
                  count: stats.totalMetricsRecords.toLocaleString(locale),
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton dateRange={dateRange} />
            <Button
              onClick={onRefresh}
              disabled={isFetching}
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin')}
              />
              <span className="sr-only">{t('refresh')}</span>
            </Button>
          </div>
        </div>
      </div>

      <style>{`@keyframes dashboard-progress { 0% { transform: translateX(-120%); } 100% { transform: translateX(420%); } }`}</style>
    </div>
  )
}
