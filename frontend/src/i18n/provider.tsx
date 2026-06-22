import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { AppLocale } from '@/i18n/config'
import { defaultLocale, isAppLocale } from '@/i18n/config'
import en from '@/i18n/messages/en.json'
import es from '@/i18n/messages/es.json'
import gl from '@/i18n/messages/gl.json'
import {
  getLocale as getParaglideLocale,
  setLocale as setParaglideLocale,
} from '@/paraglide/runtime'

type TranslationDictionary = Record<string, unknown>

const dictionaries: Record<AppLocale, TranslationDictionary> = {
  es,
  en,
  gl,
}

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

function resolveInitialLocale(): AppLocale {
  const locale = getParaglideLocale()
  if (isAppLocale(locale)) {
    return locale
  }

  return defaultLocale
}

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<AppLocale>(resolveInitialLocale)

  const setLocale = useCallback((nextLocale: AppLocale) => {
    void setParaglideLocale(nextLocale, { reload: false })
    setLocaleState(nextLocale)
  }, [])

  const t = useCallback(
    (
      namespace: string,
      key: string,
      values?: Record<string, string | number>,
    ) => {
      const dictionary = dictionaries[locale]
      const fullPath = key.length > 0 ? `${namespace}.${key}` : namespace
      const message = getNestedValue(dictionary, fullPath)
      if (!message) {
        return fullPath
      }

      return interpolate(message, values)
    },
    [locale],
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
