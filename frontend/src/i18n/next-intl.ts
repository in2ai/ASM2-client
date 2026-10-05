import { useCallback } from 'react'

import type { MessageKey, Namespace } from '@/i18n/dictionary'
import { useI18nContext } from '@/i18n/provider'

export function useLocale(): string {
  const { locale } = useI18nContext()
  return locale
}

/**
 * The messages under one namespace.
 *
 * `key` is constrained to the paths the Spanish catalogue actually defines, so
 * a typo or a message that was renamed in the JSON fails to compile instead of
 * reaching the screen as its own key path.
 */
export function useTranslations<N extends Namespace>(namespace: N) {
  const { t } = useI18nContext()

  return useCallback(
    (key: MessageKey<N>, values?: Record<string, string | number>) =>
      t(namespace, key, values),
    [namespace, t],
  )
}
