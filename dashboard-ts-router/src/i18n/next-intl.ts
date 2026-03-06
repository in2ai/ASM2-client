import { useCallback } from 'react'

import { useI18nContext } from '@/i18n/provider'

export function useLocale(): string {
  const { locale } = useI18nContext()
  return locale
}

export function useTranslations(namespace: string) {
  const { t } = useI18nContext()

  return useCallback(
    (key: string, values?: Record<string, string | number>) =>
      t(namespace, key, values),
    [namespace, t],
  )
}
