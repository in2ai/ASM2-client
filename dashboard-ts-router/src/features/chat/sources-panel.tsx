import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CheckCircle2, CloudCog, RefreshCw, Unplug } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  useDisconnectSourceMutation,
  useReindexSourcesMutation,
  useUpdateSourceSelectionMutation,
} from './api'
import {
  buildGoogleDriveAuthorizeUrl,
  createGoogleDriveOAuthState,
  GOOGLE_DRIVE_CALLBACK_PATH,
  persistGoogleDriveOAuthRequest,
} from './google-drive-auth'
import type { SourceProviderKey, SourcesStatus } from './types'

interface SourcesPanelProps {
  onOpenChange: (open: boolean) => void
  open: boolean
  status?: SourcesStatus
}

export function SourcesPanel({
  onOpenChange,
  open,
  status,
}: Readonly<SourcesPanelProps>) {
  const t = useTranslations('ChatPage')
  const [inlineError, setInlineError] = useState<string>()

  const updateSelectionMutation = useUpdateSourceSelectionMutation()
  const disconnectDriveMutation = useDisconnectSourceMutation('drive')
  const reindexMutation = useReindexSourcesMutation()

  const driveProvider = status?.providers.find(
    (provider) => provider.key === 'drive',
  )

  const selectedSet = new Set(status?.selected_sources ?? [])

  const handleToggle = async (
    provider: SourceProviderKey,
    checked: boolean,
  ) => {
    if (!status) return
    setInlineError(undefined)

    const next = new Set(status.selected_sources)
    if (checked) next.add(provider)
    else next.delete(provider)

    try {
      await updateSelectionMutation.mutateAsync(
        Array.from(next) as SourceProviderKey[],
      )
    } catch (error) {
      setInlineError(
        error instanceof Error ? error.message : t('errors.sendFailed'),
      )
    }
  }

  const startDrive = () => {
    setInlineError(undefined)

    if (!driveProvider?.oauth_client_id) {
      setInlineError(t('sources.notConfigured'))
      return
    }

    const redirectUri = `${globalThis.location.origin}${GOOGLE_DRIVE_CALLBACK_PATH}`
    const state = createGoogleDriveOAuthState()

    persistGoogleDriveOAuthRequest({
      redirectUri,
      returnTo: globalThis.location.pathname + globalThis.location.search,
      state,
    })

    globalThis.location.assign(
      buildGoogleDriveAuthorizeUrl({
        clientId: driveProvider.oauth_client_id,
        redirectUri,
        state,
      }),
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('sources.title')}</SheetTitle>
          <SheetDescription>{t('sources.description')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          {inlineError ? (
            <p className="text-sm text-red-500">{inlineError}</p>
          ) : null}

          <Card className="gap-4 rounded-3xl border-primary/10 bg-linear-to-br from-primary/5 to-transparent">
            <CardHeader className="gap-3">
              <CardTitle>{t('sources.stepsTitle')}</CardTitle>
              <CardDescription>{t('sources.stepsDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="text-muted-foreground space-y-2 text-sm">
                <li>1. {t('sources.steps.connect')}</li>
                <li>2. {t('sources.steps.authorize')}</li>
                <li>3. {t('sources.steps.select')}</li>
                <li>4. {t('sources.steps.reindex')}</li>
              </ol>
            </CardContent>
          </Card>

          {driveProvider ? (
            <Card className="gap-4 rounded-3xl">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CloudCog className="h-4 w-4" />
                      {driveProvider.label}
                    </CardTitle>
                    <CardDescription>
                      {driveProvider.account_label ??
                        t('sources.providers.drive.description')}
                    </CardDescription>
                  </div>
                  {driveProvider.connected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('sources.connected')}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!driveProvider.configured ? (
                  <p className="text-muted-foreground text-sm">
                    {t('sources.notConfigured')}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t('sources.googleDriveHelp')}
                  </p>
                )}
                {driveProvider.last_error ? (
                  <p className="text-sm text-red-500">
                    {driveProvider.last_error}
                  </p>
                ) : null}

                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={selectedSet.has(driveProvider.key)}
                    disabled={
                      !driveProvider.connected ||
                      updateSelectionMutation.isPending
                    }
                    onCheckedChange={(checked) =>
                      void handleToggle(driveProvider.key, checked === true)
                    }
                  />
                  <span>{t('sources.selectForChat')}</span>
                </label>

                <div className="flex flex-wrap gap-2">
                  {!driveProvider.connected ? (
                    <Button
                      disabled={!driveProvider.configured}
                      onClick={startDrive}
                    >
                      {t('sources.connectDrive')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() =>
                        disconnectDriveMutation.mutateAsync(undefined)
                      }
                    >
                      <Unplug className="mr-2 h-4 w-4" />
                      {t('sources.disconnect')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="gap-4 rounded-3xl">
            <CardHeader>
              <CardTitle>{t('sources.reindexTitle')}</CardTitle>
              <CardDescription>
                {t('sources.reindexDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status?.reindex.error ? (
                <p className="text-sm text-red-500">{status.reindex.error}</p>
              ) : null}
              {status?.reindex.message ? (
                <p className="text-muted-foreground text-sm">
                  {status.reindex.message}
                </p>
              ) : null}
              <Button
                variant="secondary"
                disabled={
                  status?.reindex.in_progress || !status?.reindex.available
                }
                onClick={() => reindexMutation.mutateAsync(undefined)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {status?.reindex.in_progress
                  ? t('sources.reindexing')
                  : t('sources.reindex')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
