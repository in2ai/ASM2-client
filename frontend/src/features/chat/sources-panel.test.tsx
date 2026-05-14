// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcesPanel } from './sources-panel'

const useSourceLoginInfoQueryMock = vi.fn()
const useStartVdbUpdateMutationMock = vi.fn()
const useStopVdbUpdateMutationMock = vi.fn()
const useUpdateSourcesSelectionMutationMock = vi.fn()
const useVdbUpdateStatusQueryMock = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('lucide-react', () => ({
  CheckCircle2: () => null,
  CloudCog: () => null,
  Database: () => null,
  Loader2: () => null,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}))

vi.mock('./api', () => ({
  useSourceLoginInfoQuery: (...args: unknown[]) =>
    useSourceLoginInfoQueryMock(...args),
  useStartVdbUpdateMutation: (...args: unknown[]) =>
    useStartVdbUpdateMutationMock(...args),
  useStopVdbUpdateMutation: (...args: unknown[]) =>
    useStopVdbUpdateMutationMock(...args),
  useUpdateSourcesSelectionMutation: (...args: unknown[]) =>
    useUpdateSourcesSelectionMutationMock(...args),
  useVdbUpdateStatusQuery: (...args: unknown[]) =>
    useVdbUpdateStatusQueryMock(...args),
}))

vi.mock('./google-drive-auth', () => ({
  GOOGLE_DRIVE_CALLBACK_PATH: '/chat/provider-callback',
  buildGoogleDriveAuthorizeUrl: vi.fn(() => 'https://accounts.example.test'),
  createGoogleDriveOAuthState: vi.fn(() => 'oauth-state'),
  persistGoogleDriveOAuthRequest: vi.fn(),
}))

describe('SourcesPanel', () => {
  beforeEach(() => {
    useSourceLoginInfoQueryMock.mockReturnValue({
      data: { oauth_client_id: 'client-id' },
      error: null,
      isLoading: false,
    })
    useStartVdbUpdateMutationMock.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    })
    useStopVdbUpdateMutationMock.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    })
    useUpdateSourcesSelectionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('allows connecting a source while VDB indexing is inactive', () => {
    useVdbUpdateStatusQueryMock.mockReturnValue({
      data: { active: false },
      error: null,
      isFetching: false,
    })

    render(
      <SourcesPanel
        isAdmin
        open
        onOpenChange={() => undefined}
        status={{
          can_chat: false,
          vdb_indexing_active: false,
          connected_sources: [],
          selected_sources: [],
        }}
      />,
    )

    const connectButton = screen.getByRole('button', {
      name: 'sources.connectDrive',
    })

    expect((connectButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks new source connections while VDB indexing is active', () => {
    useVdbUpdateStatusQueryMock.mockReturnValue({
      data: { active: true },
      error: null,
      isFetching: false,
    })

    render(
      <SourcesPanel
        isAdmin
        open
        onOpenChange={() => undefined}
        status={{
          can_chat: false,
          vdb_indexing_active: false,
          connected_sources: [],
          selected_sources: [],
        }}
      />,
    )

    const connectButton = screen.getByRole('button', {
      name: 'sources.connectDrive',
    })

    expect((connectButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('sources.vdb.connectPrerequisite')).toBeTruthy()
  })

  it('keeps source connection available for users while VDB indexing is active', () => {
    useVdbUpdateStatusQueryMock.mockReturnValue({
      data: { active: true },
      error: null,
      isFetching: false,
    })

    render(
      <SourcesPanel
        isAdmin={false}
        open
        onOpenChange={() => undefined}
        status={{
          can_chat: false,
          vdb_indexing_active: false,
          connected_sources: [],
          selected_sources: [],
        }}
      />,
    )

    const connectButton = screen.getByRole('button', {
      name: 'sources.connectDrive',
    })

    expect((connectButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows immediate feedback while source selection is being saved', () => {
    useVdbUpdateStatusQueryMock.mockReturnValue({
      data: { active: false },
      error: null,
      isFetching: false,
    })
    useUpdateSourcesSelectionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(() => new Promise(() => undefined)),
    })

    render(
      <SourcesPanel
        isAdmin={false}
        open
        onOpenChange={() => undefined}
        status={{
          can_chat: false,
          vdb_indexing_active: false,
          connected_sources: ['drive'],
          selected_sources: [],
        }}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'sources.selectForChat',
    }) as HTMLInputElement

    fireEvent.click(checkbox)

    expect(checkbox.checked).toBe(true)
    expect(screen.getByText('sources.selectionSaving')).toBeTruthy()
  })

  it('disables start indexing when no source is selected for retrieval', () => {
    useVdbUpdateStatusQueryMock.mockReturnValue({
      data: { active: false },
      error: null,
      isFetching: false,
    })

    render(
      <SourcesPanel
        isAdmin
        open
        onOpenChange={() => undefined}
        status={{
          can_chat: false,
          vdb_indexing_active: false,
          connected_sources: ['drive'],
          selected_sources: [],
        }}
      />,
    )

    const startButton = screen.getByRole('button', {
      name: 'sources.vdb.startUpdate',
    }) as HTMLButtonElement

    expect(startButton.disabled).toBe(true)
  })

  it('enables start indexing when at least one source is selected', () => {
    useVdbUpdateStatusQueryMock.mockReturnValue({
      data: { active: false },
      error: null,
      isFetching: false,
    })

    render(
      <SourcesPanel
        isAdmin
        open
        onOpenChange={() => undefined}
        status={{
          can_chat: false,
          vdb_indexing_active: false,
          connected_sources: ['drive'],
          selected_sources: ['drive'],
        }}
      />,
    )

    const startButton = screen.getByRole('button', {
      name: 'sources.vdb.startUpdate',
    }) as HTMLButtonElement

    expect(startButton.disabled).toBe(false)
  })
})
