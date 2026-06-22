// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { ChartVisibilityProvider } from '@/contexts/chart-visibility-context'
import { ChartVisibilityControls } from './chart-visibility-controls'

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        ariaLabel: 'Configure chart visibility',
        'charts.activityTrend': 'Activity trend',
        'charts.hourlyPattern': 'Hourly pattern',
        'charts.roleDistribution': 'Role distribution',
        hideAll: 'Hide all',
        menuLabel: 'Show/Hide Charts',
        showAll: 'Show all',
      }

      if (key === 'buttonLabel') {
        return `Charts (${values?.visibleCount}/${values?.totalCount})`
      }

      return labels[key] ?? key
    },
}))

vi.mock('lucide-react', () => ({
  Activity: () => null,
  BarChart3: () => null,
  Eye: () => <span data-testid="visible-icon" />,
  EyeOff: () => <span data-testid="hidden-icon" />,
  Settings: () => null,
  Sparkles: () => null,
  TrendingUp: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: string
    variant?: string
  }) => <button {...props}>{children}</button>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: (event: { preventDefault: () => void }) => void
  }) => (
    <button onClick={() => onSelect?.({ preventDefault: () => undefined })}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

function renderControls(view: 'overview' | 'usage' = 'usage') {
  return render(
    <ChartVisibilityProvider>
      <ChartVisibilityControls view={view} />
    </ChartVisibilityProvider>,
  )
}

describe('ChartVisibilityControls', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not render controls for the overview view', () => {
    renderControls('overview')

    expect(screen.queryByLabelText('Configure chart visibility')).toBeNull()
  })

  it('toggles individual chart visibility and bulk actions', () => {
    renderControls()

    expect(
      screen.getByLabelText('Configure chart visibility').textContent,
    ).toContain('3/3')

    fireEvent.click(screen.getByRole('button', { name: /Activity trend/ }))
    expect(
      screen.getByLabelText('Configure chart visibility').textContent,
    ).toContain('2/3')

    fireEvent.click(screen.getByRole('button', { name: 'Hide all' }))
    expect(
      screen.getByLabelText('Configure chart visibility').textContent,
    ).toContain('0/3')

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(
      screen.getByLabelText('Configure chart visibility').textContent,
    ).toContain('3/3')
  })
})
