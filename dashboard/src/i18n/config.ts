export const locales = ["es", "en"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "es";
export const localeCookieName = "NEXT_LOCALE";

export function isAppLocale(value: string | undefined): value is AppLocale {
  return value === "es" || value === "en";
}

export function toIntlLocale(locale: string): "es-ES" | "en-US" {
  return locale === "en" ? "en-US" : "es-ES";
}
