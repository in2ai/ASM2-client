// @vitest-environment jsdom

import { differenceInCalendarDays, isSameDay } from 'date-fns'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { DateRangeSelector } from './date-range-selector'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (key === 'lastDays') {
      return `Last ${values?.count} days`
    }

    const labels: Record<string, string> = {
      all: 'All',
      apply: 'Apply',
      cancel: 'Cancel',
      customRange: 'Custom range',
      customShort: 'Custom',
    }

    return labels[key] ?? key
  },
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

vi.mock('@/components/ui/calendar', () => ({
  Calendar: () => <div />,
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('lucide-react', () => ({
  CalendarIcon: () => null,
  Check: () => null,
  X: () => null,
}))

describe('DateRangeSelector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('clears the current filter when All is selected', () => {
    const onChange = vi.fn()

    render(
      <DateRangeSelector
        value={{
          from: new Date('2026-05-01T00:00:00.000Z'),
          to: new Date('2026-05-31T23:59:59.000Z'),
        }}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('builds preset date ranges relative to today', () => {
    const onChange = vi.fn()

    render(<DateRangeSelector value={undefined} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Last 7 days/ }))

    const selectedRange = onChange.mock.calls[0]?.[0]

    expect(
      isSameDay(selectedRange.to, new Date('2026-06-03T12:00:00.000Z')),
    ).toBe(true)
    expect(differenceInCalendarDays(selectedRange.to, selectedRange.from)).toBe(
      6,
    )
  })
})
