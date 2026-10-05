// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { LOCALE_STORAGE_KEY } from './config'
import { useLocale, useTranslations } from './next-intl'
import { I18nProvider, useI18nContext } from './provider'

function TranslationHarness() {
  const locale = useLocale()
  const t = useTranslations('DateRangeSelector')
  const { setLocale } = useI18nContext()

  return (
    <div>
      <output aria-label="locale">{locale}</output>
      <output aria-label="label">{t('lastDays', { count: 7 })}</output>
      <button onClick={() => setLocale('en')}>English</button>
    </div>
  )
}

function setNavigatorLanguages(languages: readonly string[]) {
  Object.defineProperty(globalThis.navigator, 'languages', {
    configurable: true,
    value: languages,
  })
}

describe('I18nProvider', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    setNavigatorLanguages(['es-ES'])
  })

  afterEach(cleanup)

  it('translates messages and interpolates values', () => {
    render(
      <I18nProvider>
        <TranslationHarness />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('locale').textContent).toBe('es')
    expect(screen.getByLabelText('label').textContent).toBe('Últimos 7 días')
  })

  it('opens in the language the browser asks for', () => {
    setNavigatorLanguages(['gl-ES', 'es-ES'])

    render(
      <I18nProvider>
        <TranslationHarness />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('locale').textContent).toBe('gl')
  })

  it('prefers a language the user chose on an earlier visit', () => {
    globalThis.localStorage.setItem(LOCALE_STORAGE_KEY, 'en')
    setNavigatorLanguages(['es-ES'])

    render(
      <I18nProvider>
        <TranslationHarness />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('locale').textContent).toBe('en')
  })

  it('ignores a language it does not carry', () => {
    setNavigatorLanguages(['de-DE', 'fr-FR'])

    render(
      <I18nProvider>
        <TranslationHarness />
      </I18nProvider>,
    )

    expect(screen.getByLabelText('locale').textContent).toBe('es')
  })

  it('loads the chosen catalogue, remembers it, and tells the document', async () => {
    render(
      <I18nProvider>
        <TranslationHarness />
      </I18nProvider>,
    )

    await act(async () => {
      screen.getByText('English').click()
    })

    expect(screen.getByLabelText('locale').textContent).toBe('en')
    await waitFor(() => {
      expect(screen.getByLabelText('label').textContent).toBe('Last 7 days')
    })

    expect(globalThis.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en-US')
  })
})
