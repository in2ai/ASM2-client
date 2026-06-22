// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { I18nProvider, useI18nContext } from './provider'
import { useLocale, useTranslations } from './next-intl'

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(() => 'es'),
  setLocale: vi.fn(),
}))

vi.mock('@/paraglide/runtime', () => ({
  getLocale: mocks.getLocale,
  setLocale: mocks.setLocale,
}))

function TranslationHarness() {
  const locale = useLocale()
  const t = useTranslations('DateRangeSelector')
  const { setLocale } = useI18nContext()

  return (
    <div>
      <output aria-label="locale">{locale}</output>
      <output aria-label="label">{t('lastDays', { count: 7 })}</output>
      <output aria-label="fallback">{t('missing.key')}</output>
      <button onClick={() => setLocale('en')}>English</button>
    </div>
  )
}

describe('I18nProvider', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('translates messages, interpolates values, and falls back to the key path', () => {
    render(
      <I18nProvider>
        <TranslationHarness />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('locale').textContent).toBe('es')
    expect(screen.getByLabelText('label').textContent).toBe('Últimos 7 días')
    expect(screen.getByLabelText('fallback').textContent).toBe(
      'DateRangeSelector.missing.key',
    )

    fireEvent.click(screen.getByText('English'))

    expect(screen.getByLabelText('locale').textContent).toBe('en')
    expect(screen.getByLabelText('label').textContent).toBe('Last 7 days')
    expect(mocks.setLocale).toHaveBeenCalledWith('en', { reload: false })
  })
})
