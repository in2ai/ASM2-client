export const locales = ['es', 'en', 'gl'] as const

export type AppLocale = (typeof locales)[number]

export const defaultLocale: AppLocale = 'es'

/** Where the chosen language is remembered between visits. */
export const LOCALE_STORAGE_KEY = 'asm2.locale'

export function isAppLocale(value: string | undefined): value is AppLocale {
  return value === 'es' || value === 'en' || value === 'gl'
}

export function toIntlLocale(locale: string): 'es-ES' | 'en-US' | 'gl-ES' {
  if (locale === 'en') return 'en-US'
  if (locale === 'gl') return 'gl-ES'
  return 'es-ES'
}

/**
 * The language to open in: what the user last chose, else what their browser
 * asks for, else the default.
 */
export function resolveInitialLocale(): AppLocale {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
    if (isAppLocale(stored ?? undefined)) {
      return stored as AppLocale
    }
  } catch {
    // Storage blocked or unavailable; fall through to the browser's languages.
  }

  for (const tag of globalThis.navigator?.languages ?? []) {
    const base = tag.split('-')[0]
    if (isAppLocale(base)) {
      return base
    }
  }

  return defaultLocale
}
