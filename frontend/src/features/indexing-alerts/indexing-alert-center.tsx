import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale, type AppLocale } from '@/i18n/config'
import { hasDashboardAccess, type LogtoUser } from '@/lib/auth'
import { Bell, BellRing, Loader2, Save, ShieldAlert } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  useDeletionGuardQuery,
  useIndexingAlertsQuery,
  useUpdateDeletionGuardMutation,
} from './api'
import { parseDeletionThreshold, selectAlertsToNotify } from './logic'
import {
  readLastNotifiedAlertId,
  rememberLastNotifiedAlertId,
} from './notification-storage'

type BrowserNotificationState = NotificationPermission | 'unsupported'

function getBrowserNotificationState(): BrowserNotificationState {
  if (globalThis.Notification === undefined) {
    return 'unsupported'
  }

  return globalThis.Notification.permission
}

function readStoredAlertId(userId: string | undefined): number | null {
  if (!userId) {
    return null
  }

  try {
    return readLastNotifiedAlertId(globalThis.localStorage, userId)
  } catch {
    return null
  }
}

function rememberStoredAlertId(userId: string, alertId: number): void {
  try {
    rememberLastNotifiedAlertId(globalThis.localStorage, userId, alertId)
  } catch {
    // localStorage is not guaranteed to be available in every browser context.
  }
}

function notificationStatusKey(permission: BrowserNotificationState): string {
  if (permission === 'granted') return 'browser.granted'
  if (permission === 'denied') return 'browser.denied'
  if (permission === 'unsupported') return 'browser.unsupported'
  return 'browser.default'
}

export function IndexingAlertCenter({
  user,
}: Readonly<{ user: LogtoUser | null }>) {
  const t = useTranslations('IndexingAlerts')
  const locale = useLocale() as AppLocale
  const enabled = hasDashboardAccess(user)
  const deletionGuardQuery = useDeletionGuardQuery(enabled)
  const alertsQuery = useIndexingAlertsQuery(enabled)
  const updateDeletionGuardMutation = useUpdateDeletionGuardMutation()
  const [thresholdInput, setThresholdInput] = useState('')
  const [thresholdDirty, setThresholdDirty] = useState(false)
  const [formError, setFormError] = useState<string>()
  const [browserNotificationState, setBrowserNotificationState] =
    useState<BrowserNotificationState>(getBrowserNotificationState)
  const lastNotifiedAlertIdRef = useRef<number | null>(null)
  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(toIntlLocale(locale), {
        maximumFractionDigits: 2,
      }),
    [locale],
  )

  useEffect(() => {
    if (deletionGuardQuery.data && !thresholdDirty) {
      const threshold = deletionGuardQuery.data.threshold_percentage
      setThresholdInput(threshold === null ? '' : String(threshold))
    }
  }, [deletionGuardQuery.data, thresholdDirty])

  useEffect(() => {
    lastNotifiedAlertIdRef.current = readStoredAlertId(user?.sub)
  }, [user?.sub])

  useEffect(() => {
    if (!enabled || !alertsQuery.data || alertsQuery.data.length === 0) {
      return
    }

    const alertsToNotify = selectAlertsToNotify(
      alertsQuery.data,
      lastNotifiedAlertIdRef.current,
    )
    const latestAlertId = Math.max(...alertsQuery.data.map((alert) => alert.id))

    if (
      user &&
      (lastNotifiedAlertIdRef.current === null ||
        latestAlertId > lastNotifiedAlertIdRef.current)
    ) {
      lastNotifiedAlertIdRef.current = latestAlertId
      rememberStoredAlertId(user.sub, latestAlertId)
    }

    if (alertsToNotify.length === 0) {
      return
    }

    for (const alert of alertsToNotify) {
      const description = t('alertDescription', {
        deleted: alert.deleted_documents,
        percentage: percentageFormatter.format(alert.percentage),
        threshold: percentageFormatter.format(alert.threshold_percentage),
        total: alert.total_documents,
      })

      toast.warning(t('alertTitle'), {
        description,
        duration: 10_000,
        id: `indexing-deletion-alert-${alert.id}`,
      })

      if (
        browserNotificationState === 'granted' &&
        globalThis.Notification !== undefined
      ) {
        try {
          new globalThis.Notification(t('alertTitle'), {
            body: description,
            icon: '/logo192.png',
            tag: `indexing-deletion-alert-${alert.id}`,
          })
        } catch {
          // The in-app notification remains available when the browser blocks it.
        }
      }
    }
  }, [
    alertsQuery.data,
    browserNotificationState,
    enabled,
    percentageFormatter,
    t,
    user,
  ])

  if (!enabled) {
    return null
  }

  const saveThreshold = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(undefined)

    const threshold = parseDeletionThreshold(thresholdInput)
    if (threshold === null) {
      setFormError(t('config.validation'))
      return
    }

    try {
      await updateDeletionGuardMutation.mutateAsync({
        threshold_percentage: threshold,
      })
      setThresholdDirty(false)
      toast.success(t('config.saved'))
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : t('config.saveFailed'),
      )
    }
  }

  const enableBrowserNotifications = async () => {
    if (globalThis.Notification === undefined) {
      setBrowserNotificationState('unsupported')
      return
    }

    try {
      const permission = await globalThis.Notification.requestPermission()
      setBrowserNotificationState(permission)
      if (permission === 'granted') {
        toast.success(t('browser.enabled'))
      }
    } catch {
      setBrowserNotificationState(getBrowserNotificationState())
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 rounded-xl"
          aria-label={t('open')}
        >
          <Bell className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <section className="space-y-4 rounded-2xl border p-4">
          <div>
            <h3 className="font-semibold">{t('config.title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('config.description')}
            </p>
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => void saveThreshold(event)}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="deletion-threshold">{t('config.label')}</Label>
                <div className="relative">
                  <Input
                    id="deletion-threshold"
                    type="number"
                    min="1"
                    max="100"
                    step="0.1"
                    inputMode="decimal"
                    value={thresholdInput}
                    disabled={
                      deletionGuardQuery.isLoading ||
                      updateDeletionGuardMutation.isPending
                    }
                    onChange={(event) => {
                      setThresholdInput(event.target.value)
                      setThresholdDirty(true)
                      setFormError(undefined)
                    }}
                    aria-describedby="deletion-threshold-help"
                    aria-invalid={Boolean(formError)}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                    %
                  </span>
                </div>
              </div>
              <Button
                type="submit"
                disabled={
                  deletionGuardQuery.isLoading ||
                  updateDeletionGuardMutation.isPending
                }
              >
                {updateDeletionGuardMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('config.save')}
              </Button>
            </div>
            <p
              id="deletion-threshold-help"
              className="text-muted-foreground text-xs"
            >
              {t('config.help')}
            </p>
            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            {deletionGuardQuery.error instanceof Error ? (
              <p role="alert" className="text-destructive text-sm">
                {deletionGuardQuery.error.message}
              </p>
            ) : null}
          </form>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">{t('browser.title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t(notificationStatusKey(browserNotificationState))}
            </p>
          </div>
          {browserNotificationState === 'default' ? (
            <Button
              variant="outline"
              onClick={() => void enableBrowserNotifications()}
            >
              <BellRing className="h-4 w-4" />
              {t('browser.enable')}
            </Button>
          ) : null}
        </section>
        {alertsQuery.error instanceof Error ? (
          <p role="alert" className="text-destructive text-sm">
            {t('alertsLoadFailed')}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
