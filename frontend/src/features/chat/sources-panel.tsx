import { Badge } from '@/components/ui/badge'
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
import { CheckCircle2, CloudCog, Database, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import {
  useSourceLoginInfoQuery,
  useStartVdbUpdateMutation,
  useStopVdbUpdateMutation,
  useUpdateSourcesSelectionMutation,
  useVdbUpdateStatusQuery,
} from './api'
import {
  buildGoogleDriveAuthorizeUrl,
  createGoogleDriveOAuthState,
  GOOGLE_DRIVE_CALLBACK_PATH,
  persistGoogleDriveOAuthRequest,
} from './google-drive-auth'
import type { SourcesStatus } from './types'

type StatusMessageTone = 'error' | 'muted'

interface StatusMessage {
  text: string
  tone: StatusMessageTone
}

function ConnectedSourceBadge({ label }: Readonly<{ label: string }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

function StatusMessageText({ message }: Readonly<{ message: StatusMessage }>) {
  return (
    <p
      className={
        message.tone === 'error'
          ? 'text-sm text-red-500'
          : 'text-muted-foreground text-sm'
      }
    >
      {message.text}
    </p>
  )
}

function getDriveMessage({
  connected,
  connectionLocked,
  driveConfigured,
  driveLoginError,
  inlineError,
  isLoading,
  notConfiguredLabel,
  helpLabel,
  prerequisiteLabel,
}: Readonly<{
  connected: boolean
  connectionLocked: boolean
  driveConfigured: boolean
  driveLoginError?: string
  inlineError?: string
  isLoading: boolean
  notConfiguredLabel: string
  helpLabel: string
  prerequisiteLabel?: string
}>): StatusMessage | null {
  if (driveLoginError) {
    return { text: driveLoginError, tone: 'error' }
  }

  if (inlineError) {
    return { text: inlineError, tone: 'error' }
  }

  if (!connected && connectionLocked && prerequisiteLabel) {
    return { text: prerequisiteLabel, tone: 'muted' }
  }

  if (driveConfigured) {
    return { text: helpLabel, tone: 'muted' }
  }

  if (isLoading) {
    return null
  }

  return { text: notConfiguredLabel, tone: 'muted' }
}

function getVdbError({
  startError,
  stopError,
  statusError,
}: Readonly<{
  startError: unknown
  stopError: unknown
  statusError: unknown
}>): string | undefined {
  if (startError instanceof Error) {
    return startError.message
  }

  if (stopError instanceof Error) {
    return stopError.message
  }

  if (statusError instanceof Error) {
    return statusError.message
  }

  return undefined
}

function getVdbStatusLabel({
  isFetching,
  isActive,
  checkingLabel,
  activeLabel,
  inactiveLabel,
}: Readonly<{
  isFetching: boolean
  isActive: boolean
  checkingLabel: string
  activeLabel: string
  inactiveLabel: string
}>): string {
  if (isFetching) {
    return checkingLabel
  }

  return isActive ? activeLabel : inactiveLabel
}

function VdbStatusBadge({
  isFetching,
  isActive,
  label,
}: Readonly<{
  isFetching: boolean
  isActive: boolean
  label: string
}>) {
  const className = isActive
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
    : 'border-border/60 bg-background text-muted-foreground'

  return (
    <Badge variant="outline" className={className}>
      {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {label}
    </Badge>
  )
}

function VdbActionButtons({
  actionPending,
  canStartIndexing,
  isActive,
  onStart,
  onStop,
  startPending,
  stopPending,
  startLabel,
  stopLabel,
}: Readonly<{
  actionPending: boolean
  canStartIndexing: boolean
  isActive: boolean
  onStart: () => void
  onStop: () => void
  startPending: boolean
  stopPending: boolean
  startLabel: string
  stopLabel: string
}>) {
  const primaryAction = isActive
    ? {
        label: stopLabel,
        onClick: onStop,
        pending: stopPending,
        disabled: actionPending,
      }
    : {
        label: startLabel,
        onClick: onStart,
        pending: startPending,
        disabled: actionPending || !canStartIndexing,
      }

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
        {primaryAction.pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {primaryAction.label}
      </Button>
    </div>
  )
}

function DriveSourceCard({
  connected,
  isAdmin,
  selected,
  selectedSources,
  vdbActive,
}: Readonly<{
  connected: boolean
  isAdmin: boolean
  selected: boolean
  selectedSources: string[]
  vdbActive: boolean
}>) {
  const t = useTranslations('ChatPage')
  const [inlineError, setInlineError] = useState<string>()
  const [optimisticSelected, setOptimisticSelected] = useState(selected)
  const [selectionPending, setSelectionPending] = useState(false)
  const driveLoginInfoQuery = useSourceLoginInfoQuery('drive')
  const updateSourcesSelectionMutation = useUpdateSourcesSelectionMutation()
  const driveOauthClientId = driveLoginInfoQuery.data?.oauth_client_id ?? null
  const driveConfigured = Boolean(driveOauthClientId)
  const connectionLocked = isAdmin && vdbActive
  const driveLoginError =
    driveLoginInfoQuery.error instanceof Error
      ? driveLoginInfoQuery.error.message
      : undefined

  useEffect(() => {
    if (!selectionPending) {
      setOptimisticSelected(selected)
    }
  }, [selected, selectionPending])

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

  const toggleSelected = async (nextSelected: boolean) => {
    setInlineError(undefined)
    setOptimisticSelected(nextSelected)
    setSelectionPending(true)

    const nextSources = new Set(selectedSources)
    if (nextSelected) {
      nextSources.add('drive')
    } else {
      nextSources.delete('drive')
    }

    try {
      await updateSourcesSelectionMutation.mutateAsync(Array.from(nextSources))
    } catch (error) {
      setOptimisticSelected(selected)
      setInlineError(
        error instanceof Error ? error.message : t('errors.sendFailed'),
      )
    } finally {
      setSelectionPending(false)
    }
  }

  const driveMessage = getDriveMessage({
    connected,
    connectionLocked,
    driveConfigured,
    driveLoginError,
    inlineError,
    isLoading: driveLoginInfoQuery.isLoading,
    notConfiguredLabel: t('sources.notConfigured'),
    helpLabel: t('sources.googleDriveHelp'),
    prerequisiteLabel: isAdmin
      ? t('sources.vdb.connectPrerequisite')
      : undefined,
  })

  return (
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
          {connected ? (
            <ConnectedSourceBadge label={t('sources.connected')} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {driveMessage ? <StatusMessageText message={driveMessage} /> : null}

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button
              disabled={
                connectionLocked ||
                !driveConfigured ||
                driveLoginInfoQuery.isLoading
              }
              onClick={startDrive}
            >
              {t('sources.connectDrive')}
            </Button>
          ) : (
            <label className="border-border bg-background flex min-h-10 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="cursor-pointer"
                aria-label={t('sources.selectForChat')}
                checked={optimisticSelected}
                disabled={selectionPending}
                onChange={(event) => void toggleSelected(event.target.checked)}
              />
              <span>{t('sources.selectForChat')}</span>
              {selectionPending ? (
                <span className="text-muted-foreground ml-1 inline-flex items-center gap-1 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('sources.selectionSaving')}
                </span>
              ) : null}
            </label>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function VdbUpdateCard({
  canStartIndexing,
  enabled,
}: Readonly<{ canStartIndexing: boolean; enabled: boolean }>) {
  const t = useTranslations('ChatPage')
  const vdbStatusQuery = useVdbUpdateStatusQuery(enabled)
  const startVdbUpdateMutation = useStartVdbUpdateMutation()
  const stopVdbUpdateMutation = useStopVdbUpdateMutation()
  const vdbError = getVdbError({
    startError: startVdbUpdateMutation.error,
    stopError: stopVdbUpdateMutation.error,
    statusError: vdbStatusQuery.error,
  })
  const vdbUpdateActive = vdbStatusQuery.data?.active ?? false
  const vdbStatusPending = vdbStatusQuery.isFetching
  const vdbActionPending =
    startVdbUpdateMutation.isPending || stopVdbUpdateMutation.isPending
  const statusLabel = getVdbStatusLabel({
    isFetching: vdbStatusPending,
    isActive: vdbUpdateActive,
    checkingLabel: t('sources.vdb.checking'),
    activeLabel: t('sources.vdb.active'),
    inactiveLabel: t('sources.vdb.inactive'),
  })

  return (
    <Card className="gap-4 rounded-3xl border-primary/10 bg-linear-to-br from-primary/5 to-transparent">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              {t('sources.vdb.title')}
            </CardTitle>
            <CardDescription>{t('sources.vdb.description')}</CardDescription>
          </div>
          <VdbStatusBadge
            isFetching={vdbStatusPending}
            isActive={vdbUpdateActive}
            label={statusLabel}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {vdbUpdateActive
            ? t('sources.vdb.activeDescription')
            : t('sources.vdb.inactiveDescription')}
        </p>

        {!vdbUpdateActive && !canStartIndexing ? (
          <p className="text-muted-foreground text-sm">
            {t('sources.vdb.startRequiresSelection')}
          </p>
        ) : null}

        {vdbError ? <p className="text-sm text-red-500">{vdbError}</p> : null}

        <VdbActionButtons
          actionPending={vdbActionPending}
          canStartIndexing={canStartIndexing}
          isActive={vdbUpdateActive}
          onStart={() => startVdbUpdateMutation.mutate()}
          onStop={() => stopVdbUpdateMutation.mutate()}
          startPending={startVdbUpdateMutation.isPending}
          stopPending={stopVdbUpdateMutation.isPending}
          startLabel={t('sources.vdb.startUpdate')}
          stopLabel={t('sources.vdb.stopUpdate')}
        />
      </CardContent>
    </Card>
  )
}

interface SourcesPanelProps {
  isAdmin: boolean
  onOpenChange: (open: boolean) => void
  open: boolean
  status?: SourcesStatus
}

export function SourcesPanel({
  isAdmin,
  onOpenChange,
  open,
  status,
}: Readonly<SourcesPanelProps>) {
  const t = useTranslations('ChatPage')
  const connectedSources = new Set(status?.connected_sources ?? [])
  const selectedSources = status?.selected_sources ?? []
  const driveConnected = connectedSources.has('drive')
  const driveSelected = selectedSources.includes('drive')
  const hasSelectedSources = selectedSources.length > 0
  const vdbStatusQuery = useVdbUpdateStatusQuery(isAdmin && open)
  const vdbActive = vdbStatusQuery.data?.active ?? false
  const panelDescription = isAdmin
    ? t('sources.descriptionAdmin')
    : t('sources.descriptionUser')
  const stepsDescription = isAdmin
    ? t('sources.stepsDescriptionAdmin')
    : t('sources.stepsDescriptionUser')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('sources.title')}</SheetTitle>
          <SheetDescription>{panelDescription}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          <Card className="gap-4 rounded-3xl border-primary/10 bg-linear-to-br from-primary/5 to-transparent">
            <CardHeader className="gap-3">
              <CardTitle>{t('sources.stepsTitle')}</CardTitle>
              <CardDescription>{stepsDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="text-muted-foreground space-y-2 text-sm">
                <li>
                  1.{' '}
                  {isAdmin
                    ? t('sources.steps.startAdmin')
                    : t('sources.steps.startUser')}
                </li>
                <li>2. {t('sources.steps.connect')}</li>
                <li>3. {t('sources.steps.authorize')}</li>
                <li>
                  4.{' '}
                  {isAdmin
                    ? t('sources.steps.finishAdmin')
                    : t('sources.steps.finishUser')}
                </li>
              </ol>
            </CardContent>
          </Card>

          {isAdmin ? (
            <VdbUpdateCard
              canStartIndexing={hasSelectedSources}
              enabled={open}
            />
          ) : null}

          <DriveSourceCard
            connected={driveConnected}
            isAdmin={isAdmin}
            selected={driveSelected}
            selectedSources={selectedSources}
            vdbActive={vdbActive}
          />

          {isAdmin && driveConnected && !vdbActive ? (
            <Card className="gap-4 rounded-3xl border-amber-500/20 bg-amber-500/5">
              <CardHeader className="gap-2">
                <CardTitle>{t('sources.readyToChatTitle')}</CardTitle>
                <CardDescription>
                  {t('sources.readyToChatDescription')}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
