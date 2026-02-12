export const locales = ["es", "en", "gl"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "es";
export const localeCookieName = "NEXT_LOCALE";

export function isAppLocale(value: string | undefined): value is AppLocale {
  return value === "es" || value === "en" || value === "gl";
}

export function toIntlLocale(locale: string): "es-ES" | "en-US" | "gl-ES" {
  if (locale === "en") return "en-US";
  if (locale === "gl") return "gl-ES";
  return "es-ES";
}
