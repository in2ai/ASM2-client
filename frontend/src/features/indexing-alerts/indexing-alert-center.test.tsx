// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { IndexingAlertCenter } from './indexing-alert-center'
import type { DeletionGuardConfig, IndexingDeletionAlert } from './types'

const mocks = vi.hoisted(() => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  useDeletionGuardQuery: vi.fn(),
  useDismissAllIndexingAlertsMutation: vi.fn(),
  useDismissIndexingAlertMutation: vi.fn(),
  useIndexingAlertsQuery: vi.fn(),
  useUpdateDeletionGuardMutation: vi.fn(),
  useUpdateDeletionGuardOverrideMutation: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: mocks.toast,
}))

vi.mock('./api', () => ({
  useDeletionGuardQuery: (...args: unknown[]) =>
    mocks.useDeletionGuardQuery(...args),
  useDismissAllIndexingAlertsMutation: (...args: unknown[]) =>
    mocks.useDismissAllIndexingAlertsMutation(...args),
  useDismissIndexingAlertMutation: (...args: unknown[]) =>
    mocks.useDismissIndexingAlertMutation(...args),
  useIndexingAlertsQuery: (...args: unknown[]) =>
    mocks.useIndexingAlertsQuery(...args),
  useUpdateDeletionGuardMutation: (...args: unknown[]) =>
    mocks.useUpdateDeletionGuardMutation(...args),
  useUpdateDeletionGuardOverrideMutation: (...args: unknown[]) =>
    mocks.useUpdateDeletionGuardOverrideMutation(...args),
}))

vi.mock('@/components/ui/dialog', () => {
  const DialogContext = createContext<{
    open: boolean
    setOpen: (open: boolean) => void
  }>({
    open: false,
    setOpen: () => undefined,
  })

  return {
    Dialog: ({
      children,
      onOpenChange,
      open = false,
    }: {
      children: ReactNode
      onOpenChange?: (open: boolean) => void
      open?: boolean
    }) => (
      <DialogContext.Provider
        value={{
          open,
          setOpen: (nextOpen) => onOpenChange?.(nextOpen),
        }}
      >
        {children}
      </DialogContext.Provider>
    ),
    DialogContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(DialogContext)
      return open ? <div role="dialog">{children}</div> : null
    },
    DialogDescription: ({ children }: { children: ReactNode }) => (
      <p>{children}</p>
    ),
    DialogHeader: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean
      children: ReactNode
    }) => {
      const { setOpen } = useContext(DialogContext)
      if (asChild && isValidElement(children)) {
        const child = children as ReactElement<
          ButtonHTMLAttributes<HTMLButtonElement>
        >
        return cloneElement(child, {
          onClick: (event) => {
            child.props.onClick?.(event)
            setOpen(true)
          },
        })
      }

      return <button onClick={() => setOpen(true)}>{children}</button>
    },
  }
})

vi.mock('@/components/ui/alert-dialog', () => {
  const AlertDialogContext = createContext<{
    open: boolean
    setOpen: (open: boolean) => void
  }>({
    open: false,
    setOpen: () => undefined,
  })

  return {
    AlertDialog: ({ children }: { children: ReactNode }) => {
      const [open, setOpen] = useState(false)
      return (
        <AlertDialogContext.Provider value={{ open, setOpen }}>
          {children}
        </AlertDialogContext.Provider>
      )
    },
    AlertDialogAction: ({
      children,
      onClick,
    }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button onClick={onClick}>{children}</button>
    ),
    AlertDialogCancel: ({
      children,
    }: ButtonHTMLAttributes<HTMLButtonElement>) => <button>{children}</button>,
    AlertDialogContent: ({ children }: { children: ReactNode }) => {
      const { open } = useContext(AlertDialogContext)
      return open ? <div>{children}</div> : null
    },
    AlertDialogDescription: ({ children }: { children: ReactNode }) => (
      <p>{children}</p>
    ),
    AlertDialogFooter: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    AlertDialogHeader: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    AlertDialogTitle: ({ children }: { children: ReactNode }) => (
      <h2>{children}</h2>
    ),
    AlertDialogTrigger: ({
      asChild,
      children,
    }: {
      asChild?: boolean
      children: ReactNode
    }) => {
      const { setOpen } = useContext(AlertDialogContext)
      if (asChild && isValidElement(children)) {
        const child = children as ReactElement<
          ButtonHTMLAttributes<HTMLButtonElement>
        >
        return cloneElement(child, {
          onClick: (event) => {
            child.props.onClick?.(event)
            setOpen(true)
          },
        })
      }

      return <button onClick={() => setOpen(true)}>{children}</button>
    },
  }
})

const managerUser = { role: 'manager', sub: 'manager-user' } as const

const sampleAlert: IndexingDeletionAlert = {
  created_at: '2026-07-17T10:00:00.000Z',
  deleted_documents: 10,
  id: 42,
  percentage: 10,
  source: 'docs',
  source_breakdown: null,
  threshold_percentage: 5,
  total_documents: 100,
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear: () => {
      values.clear()
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, String(value))
    },
  }
}

function lastNotifiedKey(userId: string): string {
  return `asm2:indexing-alerts:last-notified:v1:${encodeURIComponent(userId)}`
}

function lastSeenKey(userId: string): string {
  return `asm2:indexing-alerts:last-seen:v1:${encodeURIComponent(userId)}`
}

function installMemoryLocalStorage(): Storage {
  const storage = createMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
    writable: true,
  })
  return storage
}

function setupHooks({
  alerts = [] as IndexingDeletionAlert[],
  deletionGuard = {
    override_pending: false,
    threshold_percentage: 40,
  } as DeletionGuardConfig,
} = {}) {
  const dismissAlert = vi.fn().mockResolvedValue(undefined)
  const dismissAllAlerts = vi.fn().mockResolvedValue(undefined)
  const updateDeletionGuard = vi.fn().mockResolvedValue(deletionGuard)
  const updateOverride = vi.fn().mockResolvedValue(deletionGuard)

  mocks.useDeletionGuardQuery.mockReturnValue({
    data: deletionGuard,
    error: null,
    isLoading: false,
  })
  mocks.useIndexingAlertsQuery.mockReturnValue({
    data: alerts,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  })
  mocks.useUpdateDeletionGuardMutation.mockReturnValue({
    isPending: false,
    mutateAsync: updateDeletionGuard,
  })
  mocks.useUpdateDeletionGuardOverrideMutation.mockReturnValue({
    isPending: false,
    mutateAsync: updateOverride,
  })
  mocks.useDismissIndexingAlertMutation.mockReturnValue({
    isPending: false,
    mutateAsync: dismissAlert,
  })
  mocks.useDismissAllIndexingAlertsMutation.mockReturnValue({
    isPending: false,
    mutateAsync: dismissAllAlerts,
  })

  return {
    dismissAlert,
    dismissAllAlerts,
    updateDeletionGuard,
    updateOverride,
  }
}

function openAlertCenter() {
  fireEvent.click(screen.getByRole('button', { name: /open/ }))
}

describe('IndexingAlertCenter role access', () => {
  beforeEach(() => {
    setupHooks({
      deletionGuard: { override_pending: false, threshold_percentage: null },
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not render or fetch alert data for regular users', () => {
    render(<IndexingAlertCenter user={{ role: 'user', sub: 'regular-user' }} />)

    expect(screen.queryByRole('button', { name: 'open' })).toBeNull()
    expect(mocks.useDeletionGuardQuery).toHaveBeenCalledWith(false)
    expect(mocks.useIndexingAlertsQuery).toHaveBeenCalledWith(false)
  })

  it.each(['manager', 'admin'])('renders for the %s role', (role) => {
    render(<IndexingAlertCenter user={{ role, sub: `${role}-user` }} />)

    expect(screen.getByRole('button', { name: 'open' })).toBeTruthy()
    expect(mocks.useDeletionGuardQuery).toHaveBeenCalledWith(true)
    expect(mocks.useIndexingAlertsQuery).toHaveBeenCalledWith(true)
  })
})

describe('IndexingAlertCenter actions', () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('dismisses a single alert through the mutation', async () => {
    const { dismissAlert } = setupHooks({ alerts: [sampleAlert] })

    render(<IndexingAlertCenter user={managerUser} />)
    openAlertCenter()

    fireEvent.click(screen.getByRole('button', { name: 'history.dismiss' }))

    await waitFor(() => {
      expect(dismissAlert).toHaveBeenCalledWith(42)
    })
  })

  it('dismisses all alerts after confirmation', async () => {
    const { dismissAllAlerts } = setupHooks({ alerts: [sampleAlert] })

    render(<IndexingAlertCenter user={managerUser} />)
    openAlertCenter()

    fireEvent.click(screen.getByRole('button', { name: 'history.dismissAll' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'history.dismissAllConfirm' }),
    )

    await waitFor(() => {
      expect(dismissAllAlerts).toHaveBeenCalledWith()
    })
  })

  it('disables deletion protection through the mutation', async () => {
    const { updateDeletionGuard } = setupHooks()

    render(<IndexingAlertCenter user={managerUser} />)
    openAlertCenter()

    fireEvent.click(screen.getByRole('button', { name: 'config.disable' }))

    await waitFor(() => {
      expect(updateDeletionGuard).toHaveBeenCalledWith({
        threshold_percentage: null,
      })
    })
    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith('config.disabled')
    })
  })

  it('arms the one-time override', async () => {
    const { updateOverride } = setupHooks({
      deletionGuard: {
        override_pending: false,
        threshold_percentage: 40,
      },
    })

    render(<IndexingAlertCenter user={managerUser} />)
    openAlertCenter()

    fireEvent.click(screen.getByRole('button', { name: 'override.arm' }))

    await waitFor(() => {
      expect(updateOverride).toHaveBeenCalledWith({ override_pending: true })
    })
    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith('override.armed')
    })
  })

  it('cancels a pending override', async () => {
    const { updateOverride } = setupHooks({
      deletionGuard: {
        override_pending: true,
        threshold_percentage: 40,
      },
    })

    render(<IndexingAlertCenter user={managerUser} />)
    openAlertCenter()

    fireEvent.click(screen.getByRole('button', { name: 'override.cancel' }))

    await waitFor(() => {
      expect(updateOverride).toHaveBeenCalledWith({ override_pending: false })
    })
    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith('override.cancelled')
    })
  })
})

describe('IndexingAlertCenter browser notifications and localStorage', () => {
  let storage: Storage

  beforeEach(() => {
    storage = installMemoryLocalStorage()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('records the latest alert and shows an in-app toast', async () => {
    setupHooks({ alerts: [sampleAlert] })
    vi.stubGlobal('Notification', undefined)

    render(<IndexingAlertCenter user={managerUser} />)

    await waitFor(() => {
      expect(storage.getItem(lastNotifiedKey(managerUser.sub))).toBe('42')
    })
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'alertTitle',
      expect.objectContaining({
        id: 'indexing-deletion-alert-42',
      }),
    )
  })

  it('creates a browser notification when permission is granted', async () => {
    setupHooks({ alerts: [sampleAlert] })
    const NotificationMock = vi.fn()
    Object.assign(NotificationMock, {
      permission: 'granted',
      requestPermission: vi.fn(),
    })
    vi.stubGlobal('Notification', NotificationMock)

    render(<IndexingAlertCenter user={managerUser} />)

    await waitFor(() => {
      expect(NotificationMock).toHaveBeenCalledWith(
        'alertTitle',
        expect.objectContaining({
          tag: 'indexing-deletion-alert-42',
        }),
      )
    })
  })

  it('requests browser notification permission when enabled', async () => {
    setupHooks()
    const requestPermission = vi
      .fn()
      .mockResolvedValue('granted' as NotificationPermission)
    const NotificationMock = vi.fn()
    Object.assign(NotificationMock, {
      permission: 'default',
      requestPermission,
    })
    vi.stubGlobal('Notification', NotificationMock)

    render(<IndexingAlertCenter user={managerUser} />)
    openAlertCenter()

    fireEvent.click(screen.getByRole('button', { name: 'browser.enable' }))

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mocks.toast.success).toHaveBeenCalledWith('browser.enabled')
    })
  })

  it('marks alerts as seen in localStorage when the dialog opens', async () => {
    setupHooks({ alerts: [sampleAlert] })
    vi.stubGlobal('Notification', undefined)

    render(<IndexingAlertCenter user={managerUser} />)

    expect(screen.getByRole('button', { name: 'openWithUnseen' })).toBeTruthy()

    openAlertCenter()

    await waitFor(() => {
      expect(storage.getItem(lastSeenKey(managerUser.sub))).toBe('42')
    })
    expect(screen.getByRole('button', { name: 'open' })).toBeTruthy()
  })

  it('does not re-notify alerts that were already stored as notified', async () => {
    storage.setItem(lastNotifiedKey(managerUser.sub), '42')
    setupHooks({ alerts: [sampleAlert] })
    vi.stubGlobal('Notification', undefined)

    render(<IndexingAlertCenter user={managerUser} />)

    await waitFor(() => {
      expect(mocks.useIndexingAlertsQuery).toHaveBeenCalled()
    })

    expect(mocks.toast.warning).not.toHaveBeenCalled()
  })
})
