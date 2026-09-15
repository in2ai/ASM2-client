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
import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Cloud, CloudCog, Database, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useSourceLoginInfoQuery,
  useStartVdbUpdateMutation,
  useStopVdbUpdateMutation,
  useUpdateSourcesSelectionMutation,
  useVdbUpdateStatusQuery,
} from './api'
import {
  buildDropboxAuthorizeUrl,
  createDropboxOAuthState,
  DROPBOX_CALLBACK_PATH,
  persistDropboxOAuthRequest,
} from './dropbox-auth'
import {
  buildGoogleDriveAuthorizeUrl,
  createGoogleDriveOAuthState,
  GOOGLE_DRIVE_CALLBACK_PATH,
  persistGoogleDriveOAuthRequest,
} from './google-drive-auth'
import type { SourceProviderKey, SourcesStatus } from './types'

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

function getProviderMessage({
  connected,
  connectionLocked,
  configured,
  loginError,
  inlineError,
  isLoading,
  notConfiguredLabel,
  helpLabel,
  prerequisiteLabel,
}: Readonly<{
  connected: boolean
  connectionLocked: boolean
  configured: boolean
  loginError?: string
  inlineError?: string
  isLoading: boolean
  notConfiguredLabel: string
  helpLabel: string
  prerequisiteLabel?: string
}>): StatusMessage | null {
  if (loginError) {
    return { text: loginError, tone: 'error' }
  }

  if (inlineError) {
    return { text: inlineError, tone: 'error' }
  }

  if (!connected && connectionLocked && prerequisiteLabel) {
    return { text: prerequisiteLabel, tone: 'muted' }
  }

  if (configured) {
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
  runInProgress,
  startPending,
  stopPending,
  startLabel,
  stopLabel,
  reindexLabel,
}: Readonly<{
  actionPending: boolean
  canStartIndexing: boolean
  isActive: boolean
  onStart: () => void
  onStop: () => void
  runInProgress: boolean
  startPending: boolean
  stopPending: boolean
  startLabel: string
  stopLabel: string
  reindexLabel: string
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
      {isActive ? (
        <Button
          variant="outline"
          // A second run cannot start while one works, so the backend would
          // drop this request: the action stays out of reach until it ends.
          disabled={actionPending || !canStartIndexing || runInProgress}
          onClick={onStart}
        >
          {startPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {reindexLabel}
        </Button>
      ) : null}
    </div>
  )
}

interface ProviderConfig {
  buildAuthorizeUrl: (input: {
    clientId: string
    redirectUri: string
    state: string
  }) => string
  callbackPath: string
  connectLabelKey: string
  createOAuthState: () => string
  descriptionKey: string
  helpLabelKey: string
  icon: LucideIcon
  label: string
  persistOAuthRequest: (input: {
    redirectUri: string
    returnTo: string
    state: string
  }) => void
  providerKey: SourceProviderKey
}

const DRIVE_PROVIDER_CONFIG: ProviderConfig = {
  buildAuthorizeUrl: buildGoogleDriveAuthorizeUrl,
  callbackPath: GOOGLE_DRIVE_CALLBACK_PATH,
  connectLabelKey: 'connectDrive',
  createOAuthState: createGoogleDriveOAuthState,
  descriptionKey: 'providers.drive.description',
  helpLabelKey: 'googleDriveHelp',
  icon: CloudCog,
  label: 'Google Drive',
  persistOAuthRequest: persistGoogleDriveOAuthRequest,
  providerKey: 'drive',
}

const DROPBOX_PROVIDER_CONFIG: ProviderConfig = {
  buildAuthorizeUrl: buildDropboxAuthorizeUrl,
  callbackPath: DROPBOX_CALLBACK_PATH,
  connectLabelKey: 'connectDropbox',
  createOAuthState: createDropboxOAuthState,
  descriptionKey: 'providers.dropbox.description',
  helpLabelKey: 'dropboxHelp',
  icon: Cloud,
  label: 'Dropbox',
  persistOAuthRequest: persistDropboxOAuthRequest,
  providerKey: 'dropbox',
}

interface SourcesSelection {
  errorFor: (providerKey: SourceProviderKey) => string | undefined
  isPending: (providerKey: SourceProviderKey) => boolean
  isSelected: (providerKey: SourceProviderKey) => boolean
  toggle: (providerKey: SourceProviderKey, nextSelected: boolean) => void
}

function withProvider(
  sources: string[],
  providerKey: SourceProviderKey,
  selected: boolean,
): string[] {
  const next = new Set(sources)

  if (selected) {
    next.add(providerKey)
  } else {
    next.delete(providerKey)
  }

  return Array.from(next)
}

function withoutFirst(
  providers: SourceProviderKey[],
  providerKey: SourceProviderKey,
): SourceProviderKey[] {
  const index = providers.indexOf(providerKey)

  if (index === -1) {
    return providers
  }

  return [...providers.slice(0, index), ...providers.slice(index + 1)]
}

// Every provider card edits the same list, so a request must carry the toggles
// made while the previous one was still in flight: the desired list lives here
// and requests are chained instead of racing each other.
function useSourcesSelection(selectedSources: string[]): SourcesSelection {
  const t = useTranslations('ChatPage')
  const updateSourcesSelectionMutation = useUpdateSourcesSelectionMutation()
  const [selection, setSelection] = useState(selectedSources)
  const [pendingProviders, setPendingProviders] = useState<SourceProviderKey[]>(
    [],
  )
  const [errors, setErrors] = useState<
    Partial<Record<SourceProviderKey, string>>
  >({})
  const desiredRef = useRef(selectedSources)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const hasPending = pendingProviders.length > 0

  useEffect(() => {
    // While a request is in flight the desired list is ahead of the saved one.
    if (hasPending) {
      return
    }

    desiredRef.current = selectedSources
    setSelection(selectedSources)
  }, [hasPending, selectedSources])

  const rollback = (
    providerKey: SourceProviderKey,
    appliedSelected: boolean,
  ) => {
    // A newer toggle already replaced this value, so it owns the rollback.
    if (desiredRef.current.includes(providerKey) !== appliedSelected) {
      return
    }

    const reverted = withProvider(
      desiredRef.current,
      providerKey,
      !appliedSelected,
    )
    desiredRef.current = reverted
    setSelection(reverted)
  }

  const toggle = (providerKey: SourceProviderKey, nextSelected: boolean) => {
    const nextSources = withProvider(
      desiredRef.current,
      providerKey,
      nextSelected,
    )
    desiredRef.current = nextSources
    setSelection(nextSources)
    setErrors((current) => ({ ...current, [providerKey]: undefined }))
    setPendingProviders((current) => [...current, providerKey])

    queueRef.current = queueRef.current
      .then(() =>
        updateSourcesSelectionMutation.mutateAsync(desiredRef.current),
      )
      .catch((error: unknown) => {
        rollback(providerKey, nextSelected)
        setErrors((current) => ({
          ...current,
          [providerKey]:
            error instanceof Error ? error.message : t('errors.sendFailed'),
        }))
      })
      .finally(() => {
        setPendingProviders((current) => withoutFirst(current, providerKey))
      })
  }

  return {
    errorFor: (providerKey) => errors[providerKey],
    isPending: (providerKey) => pendingProviders.includes(providerKey),
    isSelected: (providerKey) => selection.includes(providerKey),
    toggle,
  }
}

function ProviderSourceCard({
  config,
  connected,
  isAdmin,
  selection,
  vdbActive,
}: Readonly<{
  config: ProviderConfig
  connected: boolean
  isAdmin: boolean
  selection: SourcesSelection
  vdbActive: boolean
}>) {
  const t = useTranslations('ChatPage')
  const [connectError, setConnectError] = useState<string>()
  const loginInfoQuery = useSourceLoginInfoQuery(config.providerKey)
  const oauthClientId = loginInfoQuery.data?.oauth_client_id ?? null
  const configured = Boolean(oauthClientId)
  const connectionLocked = isAdmin && vdbActive
  const selected = selection.isSelected(config.providerKey)
  const selectionPending = selection.isPending(config.providerKey)
  const inlineError = connectError ?? selection.errorFor(config.providerKey)
  const loginError =
    loginInfoQuery.error instanceof Error
      ? loginInfoQuery.error.message
      : undefined
  const Icon = config.icon

  const startConnect = () => {
    setConnectError(undefined)

    if (!oauthClientId) {
      setConnectError(t('sources.notConfigured'))
      return
    }

    const redirectUri = `${globalThis.location.origin}${config.callbackPath}`
    const state = config.createOAuthState()

    config.persistOAuthRequest({
      redirectUri,
      returnTo: globalThis.location.pathname + globalThis.location.search,
      state,
    })

    globalThis.location.assign(
      config.buildAuthorizeUrl({ clientId: oauthClientId, redirectUri, state }),
    )
  }

  const providerMessage = getProviderMessage({
    connected,
    connectionLocked,
    configured,
    loginError,
    inlineError,
    isLoading: loginInfoQuery.isLoading,
    notConfiguredLabel: t('sources.notConfigured'),
    helpLabel: t(`sources.${config.helpLabelKey}`),
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
              <Icon className="h-4 w-4" />
              {config.label}
            </CardTitle>
            <CardDescription>
              {t(`sources.${config.descriptionKey}`)}
            </CardDescription>
          </div>
          {connected ? (
            <ConnectedSourceBadge label={t('sources.connected')} />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {providerMessage ? (
          <StatusMessageText message={providerMessage} />
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button
              disabled={
                connectionLocked || !configured || loginInfoQuery.isLoading
              }
              onClick={startConnect}
            >
              {t(`sources.${config.connectLabelKey}`)}
            </Button>
          ) : (
            <label className="border-border bg-background flex min-h-10 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="cursor-pointer"
                aria-label={t('sources.selectForChat')}
                checked={selected}
                disabled={selectionPending}
                onChange={(event) =>
                  selection.toggle(config.providerKey, event.target.checked)
                }
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
  const vdbRunInProgress = vdbStatusQuery.data?.running ?? false
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

        {vdbRunInProgress ? (
          <p className="text-muted-foreground text-sm">
            {t('sources.vdb.runInProgress')}
          </p>
        ) : null}

        {vdbError ? <p className="text-sm text-red-500">{vdbError}</p> : null}

        <VdbActionButtons
          actionPending={vdbActionPending}
          canStartIndexing={canStartIndexing}
          isActive={vdbUpdateActive}
          onStart={() => startVdbUpdateMutation.mutate()}
          onStop={() => stopVdbUpdateMutation.mutate()}
          runInProgress={vdbRunInProgress}
          startPending={startVdbUpdateMutation.isPending}
          stopPending={stopVdbUpdateMutation.isPending}
          startLabel={t('sources.vdb.startUpdate')}
          stopLabel={t('sources.vdb.stopUpdate')}
          reindexLabel={t('sources.vdb.reindexNow')}
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
  const selectedSources = useMemo(
    () => status?.selected_sources ?? [],
    [status?.selected_sources],
  )
  const selection = useSourcesSelection(selectedSources)
  const driveConnected = connectedSources.has('drive')
  const dropboxConnected = connectedSources.has('dropbox')
  const hasSelectedSources = selectedSources.length > 0
  const hasConnectedSources = connectedSources.size > 0
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

          <ProviderSourceCard
            config={DRIVE_PROVIDER_CONFIG}
            connected={driveConnected}
            isAdmin={isAdmin}
            selection={selection}
            vdbActive={vdbActive}
          />

          <ProviderSourceCard
            config={DROPBOX_PROVIDER_CONFIG}
            connected={dropboxConnected}
            isAdmin={isAdmin}
            selection={selection}
            vdbActive={vdbActive}
          />

          {isAdmin && hasConnectedSources && !vdbActive ? (
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
