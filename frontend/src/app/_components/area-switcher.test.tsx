// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { AreaSwitcher } from './area-switcher'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string => {
      const labels: Record<string, string> = {
        chat: 'Chat',
        dashboard: 'Dashboard',
        label: 'Switch area',
      }

      return labels[key] ?? key
    },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    asChild: _asChild,
    children,
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    size?: string
    variant?: string
  }) => <span {...props}>{children}</span>,
}))

vi.mock('lucide-react', () => ({
  BarChart3: () => null,
  MessageSquareText: () => null,
}))

describe('AreaSwitcher', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders dashboard/chat navigation for dashboard-capable roles only', () => {
    const { rerender } = render(
      <AreaSwitcher activeArea="chat" user={{ role: 'user', sub: 'user-1' }} />,
    )

    expect(screen.queryByLabelText('Switch area')).toBeNull()

    rerender(
      <AreaSwitcher
        activeArea="dashboard"
        user={{ role: 'manager', sub: 'manager-1' }}
      />,
    )

    expect(screen.getByLabelText('Switch area')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveProperty(
      'href',
      'http://localhost:3000/chat',
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveProperty(
      'href',
      'http://localhost:3000/',
    )
    expect(
      screen
        .getByText('Dashboard')
        .closest('[aria-current]')
        ?.getAttribute('aria-current'),
    ).toBe('page')

    rerender(
      <AreaSwitcher
        activeArea="chat"
        user={{ role: 'admin', sub: 'admin-1' }}
      />,
    )

    expect(screen.getByLabelText('Switch area')).toBeTruthy()
  })
})
