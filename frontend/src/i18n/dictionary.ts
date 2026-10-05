import type { AppLocale } from '@/i18n/config'
import { defaultLocale } from '@/i18n/config'
import es from '@/i18n/messages/es.json'

/**
 * The shape every catalogue shares.
 *
 * Spanish is the source language, so its file defines both the runtime
 * fallback and -- through `MessageKey` below -- the set of keys the rest of
 * the app is allowed to ask for.
 */
export type Dictionary = typeof es

/** Every dotted path under `T` that ends at a message rather than a group. */
type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`
    }[keyof T & string]

/** Every dotted path under `T` that ends at a group, which is what a namespace is. */
type Branches<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? never
        : K | `${K}.${Branches<T[K]>}`
    }[keyof T & string]

/** Walks a dotted path into `T`. */
type At<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? At<T[Head], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never

export type Namespace = Branches<Dictionary>

export type MessageKey<N extends Namespace> = Leaves<At<Dictionary, N>>

/** The source catalogue, always present, used when a translation is missing. */
export const fallbackDictionary: Dictionary = es

/**
 * Only the language in use is fetched.
 *
 * The default one is part of the bundle so the first paint has its text with
 * no extra round trip; the others are split out, which keeps two catalogues
 * the reader will never see out of the entry chunk.
 */
const loaders: Record<AppLocale, () => Promise<Dictionary>> = {
  es: () => Promise.resolve(es),
  en: () =>
    import('@/i18n/messages/en.json').then(
      (module) => module.default as Dictionary,
    ),
  gl: () =>
    import('@/i18n/messages/gl.json').then(
      (module) => module.default as Dictionary,
    ),
}

const cache = new Map<AppLocale, Dictionary>([[defaultLocale, es]])

export function getLoadedDictionary(locale: AppLocale): Dictionary | undefined {
  return cache.get(locale)
}

export async function loadDictionary(locale: AppLocale): Promise<Dictionary> {
  const cached = cache.get(locale)
  if (cached) {
    return cached
  }

  const dictionary = await loaders[locale]()
  cache.set(locale, dictionary)
  return dictionary
}
