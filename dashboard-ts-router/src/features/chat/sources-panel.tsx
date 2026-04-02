import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CheckCircle2, CloudCog } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useSourceLoginInfoQuery } from './api'
import {
  buildGoogleDriveAuthorizeUrl,
  createGoogleDriveOAuthState,
  GOOGLE_DRIVE_CALLBACK_PATH,
  persistGoogleDriveOAuthRequest,
} from './google-drive-auth'
import type { SourcesStatus } from './types'

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
  const driveLoginInfoQuery = useSourceLoginInfoQuery('drive')
  const driveConnected = status?.connected_sources.includes('drive') ?? false
  const driveOauthClientId = driveLoginInfoQuery.data?.oauth_client_id ?? null
  const driveConfigured = Boolean(driveOauthClientId)
  const driveLoginError =
    driveLoginInfoQuery.error instanceof Error
      ? driveLoginInfoQuery.error.message
      : undefined

  const startDrive = () => {
    setInlineError(undefined)

    if (!driveOauthClientId) {
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
        clientId: driveOauthClientId,
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
              </ol>
            </CardContent>
          </Card>

          <Card className="gap-4 rounded-3xl">
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CloudCog className="h-4 w-4" />
                    Google Drive
                  </CardTitle>
                  <CardDescription>
                    {t('sources.providers.drive.description')}
                  </CardDescription>
                </div>
                {driveConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('sources.connected')}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {driveLoginError ? (
                <p className="text-sm text-red-500">{driveLoginError}</p>
              ) : driveConfigured ? (
                <p className="text-muted-foreground text-sm">
                  {t('sources.googleDriveHelp')}
                </p>
              ) : driveLoginInfoQuery.isLoading ? null : (
                <p className="text-muted-foreground text-sm">
                  {t('sources.notConfigured')}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {!driveConnected ? (
                  <Button
                    disabled={!driveConfigured || driveLoginInfoQuery.isLoading}
                    onClick={startDrive}
                  >
                    {t('sources.connectDrive')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}
