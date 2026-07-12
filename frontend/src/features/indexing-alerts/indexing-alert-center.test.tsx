// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { IndexingAlertCenter } from './indexing-alert-center'

const mocks = vi.hoisted(() => ({
  useDeletionGuardQuery: vi.fn(),
  useIndexingAlertsQuery: vi.fn(),
  useUpdateDeletionGuardMutation: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => (key: string) => key,
}))

vi.mock('./api', () => ({
  useDeletionGuardQuery: (...args: unknown[]) =>
    mocks.useDeletionGuardQuery(...args),
  useIndexingAlertsQuery: (...args: unknown[]) =>
    mocks.useIndexingAlertsQuery(...args),
  useUpdateDeletionGuardMutation: (...args: unknown[]) =>
    mocks.useUpdateDeletionGuardMutation(...args),
}))

describe('IndexingAlertCenter role access', () => {
  beforeEach(() => {
    mocks.useDeletionGuardQuery.mockReturnValue({
      data: { threshold_percentage: null },
      error: null,
      isLoading: false,
    })
    mocks.useIndexingAlertsQuery.mockReturnValue({
      data: [],
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    })
    mocks.useUpdateDeletionGuardMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
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
