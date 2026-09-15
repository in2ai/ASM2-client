// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
import { IndexingProgressIndicator } from './indexing-progress-indicator'
import type { IndexingProgress } from './types'

const mocks = vi.hoisted(() => ({
  useIndexingProgressQuery: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
}))

vi.mock('./api', () => ({
  useIndexingProgressQuery: (...args: unknown[]) =>
    mocks.useIndexingProgressQuery(...args),
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
    Dialog: ({ children }: { children: ReactNode }) => {
      const [open, setOpen] = useState(false)
      return (
        <DialogContext.Provider value={{ open, setOpen }}>
          {children}
        </DialogContext.Provider>
      )
    },
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

function buildProgress(
  overrides: Partial<IndexingProgress> = {},
): IndexingProgress {
  return {
    status: 'idle',
    phase: null,
    current_source: null,
    sources_total: 0,
    sources_completed: 0,
    files_total: 0,
    files_processed: 0,
    chunks_indexed: 0,
    eta_seconds: null,
    detail: null,
    started_at: null,
    updated_at: '2026-09-07T10:00:00.000Z',
    finished_at: null,
    indexing_enabled: false,
    ...overrides,
  }
}

function mockQuery(
  data: IndexingProgress | undefined,
  overrides: Record<string, unknown> = {},
) {
  mocks.useIndexingProgressQuery.mockReturnValue({
    data,
    error: null,
    isLoading: false,
    ...overrides,
  })
}

const managerUser = { role: 'manager', sub: 'manager-user' } as const
const adminUser = { role: 'admin', sub: 'admin-user' } as const

describe('IndexingProgressIndicator', () => {
  beforeEach(() => {
    mocks.useIndexingProgressQuery.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('stays hidden and does not query for users without dashboard access', () => {
    mockQuery(undefined)

    const { container } = render(
      <IndexingProgressIndicator
        user={{ role: 'user', sub: 'regular-user' }}
      />,
    )

    expect(container.innerHTML).toBe('')
    expect(mocks.useIndexingProgressQuery).toHaveBeenCalledWith(false)
  })

  it('shows the percentage of the run in progress to a manager', () => {
    mockQuery(
      buildProgress({
        status: 'running',
        phase: 'indexing',
        current_source: 'drive',
        sources_total: 2,
        files_processed: 5,
        files_total: 20,
        chunks_indexed: 340,
        eta_seconds: 95,
        started_at: '2026-09-07T09:55:00.000Z',
        indexing_enabled: true,
      }),
    )

    render(<IndexingProgressIndicator user={managerUser} />)

    expect(mocks.useIndexingProgressQuery).toHaveBeenCalledWith(true)
    expect(screen.getByText('25%')).toBeTruthy()
  })

  it('details the current phase, files and remaining time once opened', () => {
    mockQuery(
      buildProgress({
        status: 'running',
        phase: 'indexing',
        current_source: 'drive',
        sources_total: 2,
        sources_completed: 1,
        files_processed: 5,
        files_total: 20,
        chunks_indexed: 340,
        eta_seconds: 95,
        started_at: '2026-09-07T09:55:00.000Z',
        indexing_enabled: true,
      }),
    )

    render(<IndexingProgressIndicator user={managerUser} />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('phase.indexing')).toBeTruthy()
    expect(screen.getByText('files 5 20')).toBeTruthy()
    expect(screen.getByText('eta 1 min 35 s')).toBeTruthy()
    expect(screen.getByText('sourcesValue 1 2')).toBeTruthy()
    expect(screen.getByText('drive')).toBeTruthy()
    expect(screen.getByText('340')).toBeTruthy()
    expect(screen.getByText('automaticEnabled')).toBeTruthy()
  })

  it('reports the last failed run and its detail to an admin', () => {
    mockQuery(
      buildProgress({
        status: 'failed',
        detail: 'RuntimeError: embeddings unavailable',
        started_at: '2026-09-07T09:00:00.000Z',
        finished_at: '2026-09-07T09:05:00.000Z',
        indexing_enabled: true,
      }),
    )

    render(<IndexingProgressIndicator user={adminUser} />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('status.failed')).toBeTruthy()
    expect(screen.getByText('statusDescription.failed')).toBeTruthy()
    expect(
      screen.getByText('RuntimeError: embeddings unavailable'),
    ).toBeTruthy()
  })

  it('warns when the progress cannot be checked', () => {
    mockQuery(undefined, { error: new Error('Forbidden') })

    render(<IndexingProgressIndicator user={managerUser} />)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('alert').textContent).toBe('loadFailed')
  })
})
