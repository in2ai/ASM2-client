import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { AppLocale } from '@/i18n/config'
import {
  LOCALE_STORAGE_KEY,
  resolveInitialLocale,
  toIntlLocale,
} from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionary'
import {
  fallbackDictionary,
  getLoadedDictionary,
  loadDictionary,
} from '@/i18n/dictionary'

interface I18nContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (
    namespace: string,
    key: string,
    values?: Record<string, string | number>,
  ) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getNestedValue(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') {
    return undefined
  }

  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined
    }

    current = (current as Record<string, unknown>)[part]
  }

  return typeof current === 'string' ? current : undefined
}

function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]
    return value === undefined ? `{${key}}` : String(value)
  })
}

/** Said once per key, so a missing message is noticed without flooding the log. */
const warned = new Set<string>()

function warnMissing(locale: AppLocale, path: string) {
  if (!import.meta.env.DEV || warned.has(`${locale}:${path}`)) {
    return
  }

  warned.add(`${locale}:${path}`)
  console.warn(`[i18n] missing message "${path}" for locale "${locale}"`)
}

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<AppLocale>(resolveInitialLocale)
  const [dictionary, setDictionary] = useState<Dictionary>(
    () => getLoadedDictionary(resolveInitialLocale()) ?? fallbackDictionary,
  )

  useEffect(() => {
    let cancelled = false

    void loadDictionary(locale).then((loaded) => {
      if (!cancelled) {
        setDictionary(loaded)
      }
    })

    return () => {
      cancelled = true
    }
  }, [locale])

  // Assistive technology reads the page in whatever `lang` says, and the
  // document shipped with a hardcoded one that outlived the user's choice.
  useEffect(() => {
    document.documentElement.lang = toIntlLocale(locale)
  }, [locale])

  const setLocale = useCallback((nextLocale: AppLocale) => {
    setLocaleState(nextLocale)

    try {
      globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, nextLocale)
    } catch {
      // The choice still holds for this session.
    }
  }, [])

  const t = useCallback(
    (
      namespace: string,
      key: string,
      values?: Record<string, string | number>,
    ) => {
      const fullPath = key.length > 0 ? `${namespace}.${key}` : namespace
      const message = getNestedValue(dictionary, fullPath)

      if (message !== undefined) {
        return interpolate(message, values)
      }

      warnMissing(locale, fullPath)

      // An untranslated key is shown in the source language rather than as its
      // own path: a reader of a half-translated locale gets a real sentence
      // instead of "ChatPage.errors.sendFailed".
      const fallback = getNestedValue(fallbackDictionary, fullPath)
      return fallback === undefined ? fullPath : interpolate(fallback, values)
    },
    [dictionary, locale],
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18nContext() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18nContext must be used within I18nProvider')
  }

  return context
}
