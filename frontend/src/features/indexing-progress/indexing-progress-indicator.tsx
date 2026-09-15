import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { toIntlLocale, type AppLocale } from '@/i18n/config'
import { hasDashboardAccess, type LogtoUser } from '@/lib/auth'
import { Database, DatabaseZap, Loader2, TriangleAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useIndexingProgressQuery } from './api'
import {
  formatRemainingTime,
  hasCompletedRun,
  isIndexingRunning,
  needsAttention,
  phaseLabelKey,
  selectFileProgressPercentage,
  statusDescriptionKey,
  statusLabelKey,
} from './logic'

export function IndexingProgressIndicator({
  user,
}: Readonly<{ user: LogtoUser | null }>) {
  const t = useTranslations('IndexingProgress')
  const locale = useLocale() as AppLocale
  const enabled = hasDashboardAccess(user)
  const progressQuery = useIndexingProgressQuery(enabled)
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(toIntlLocale(locale)),
    [locale],
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(toIntlLocale(locale), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  )
  const durationFormatters = useMemo(() => {
    const unitFormatter = (unit: 'hour' | 'minute' | 'second') =>
      new Intl.NumberFormat(toIntlLocale(locale), {
        style: 'unit',
        unit,
        unitDisplay: 'short',
      })

    return {
      hour: unitFormatter('hour'),
      minute: unitFormatter('minute'),
      second: unitFormatter('second'),
    }
  }, [locale])

  if (!enabled) {
    return null
  }

  const progress = progressQuery.data
  const unavailable = Boolean(progressQuery.error)
  const running = !unavailable && isIndexingRunning(progress)
  const percentage = selectFileProgressPercentage(progress)
  const eta = formatRemainingTime(
    progress?.eta_seconds ?? null,
    durationFormatters,
  )
  const attention = needsAttention(progress)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={running ? 'default' : 'ghost'}
          size={running || unavailable ? 'default' : 'icon'}
          className="relative min-h-11 gap-2 rounded-xl"
          aria-label={
            unavailable
              ? t('unavailable')
              : running
                ? t('openRunning', {
                    status: t(phaseLabelKey(progress?.phase)),
                  })
                : t('open')
          }
        >
          {unavailable ? (
            <>
              <TriangleAlert className="text-destructive h-4 w-4" />
              <span className="text-xs font-semibold">{t('unavailable')}</span>
            </>
          ) : running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs font-semibold tabular-nums">
                {percentage === null ? t('inProgress') : `${percentage}%`}
              </span>
            </>
          ) : (
            <Database className="h-5 w-5" />
          )}
          {!running && !unavailable && attention ? (
            <span
              aria-hidden="true"
              className="bg-destructive absolute top-1 right-1 h-2 w-2 rounded-full"
            />
          ) : null}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseZap className="text-primary h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {unavailable ? (
          <p role="alert" className="text-destructive text-sm">
            {t('loadFailed')}
          </p>
        ) : null}

        {progressQuery.isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        ) : null}

        {progress ? (
          <section className="space-y-4 rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {unavailable
                    ? t('lastKnownState')
                    : running
                      ? t(phaseLabelKey(progress.phase))
                      : t(statusLabelKey(progress.status))}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {unavailable
                    ? t('lastKnownDescription', {
                        status: t(statusLabelKey(progress.status)),
                      })
                    : running
                      ? t('runningDescription')
                      : t(statusDescriptionKey(progress.status))}
                </p>
              </div>
              {running ? (
                <Loader2 className="text-primary mt-1 h-4 w-4 shrink-0 animate-spin" />
              ) : null}
            </div>

            {running ? (
              <div className="space-y-2">
                {percentage === null ? (
                  <div
                    role="progressbar"
                    aria-label={t('indeterminateLabel')}
                    className="bg-primary/20 h-2 w-full overflow-hidden rounded-full"
                  >
                    <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
                  </div>
                ) : (
                  <Progress value={percentage} aria-label={t('barLabel')} />
                )}
                <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    {t('files', {
                      processed: numberFormatter.format(
                        progress.files_processed,
                      ),
                      total: numberFormatter.format(progress.files_total),
                    })}
                  </span>
                  {eta ? <span>{t('eta', { eta })}</span> : null}
                </div>
              </div>
            ) : null}

            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <ProgressField
                label={t('sources')}
                value={t('sourcesValue', {
                  completed: numberFormatter.format(progress.sources_completed),
                  total: numberFormatter.format(progress.sources_total),
                })}
              />
              <ProgressField
                label={t('currentSource')}
                value={progress.current_source ?? t('noSource')}
              />
              <ProgressField
                label={t('chunks')}
                value={numberFormatter.format(progress.chunks_indexed)}
              />
              <ProgressField
                label={t('automatic')}
                value={
                  progress.indexing_enabled
                    ? t('automaticEnabled')
                    : t('automaticDisabled')
                }
              />
              <ProgressField
                label={t('startedAt')}
                value={formatTimestamp(progress.started_at, dateFormatter, t)}
              />
              <ProgressField
                label={
                  hasCompletedRun(progress) ? t('finishedAt') : t('lastUpdate')
                }
                value={formatTimestamp(
                  hasCompletedRun(progress)
                    ? progress.finished_at
                    : progress.updated_at,
                  dateFormatter,
                  t,
                )}
              />
            </dl>

            {progress.detail ? (
              <p className="text-destructive text-sm wrap-break-word">
                {progress.detail}
              </p>
            ) : null}
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function formatTimestamp(
  timestamp: string | null,
  formatter: Intl.DateTimeFormat,
  t: (key: string) => string,
): string {
  if (!timestamp) {
    return t('never')
  }

  const date = new Date(timestamp)

  return Number.isNaN(date.getTime()) ? t('never') : formatter.format(date)
}

function ProgressField({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </dt>
      <dd className="font-medium wrap-break-word">{value}</dd>
    </div>
  )
}
