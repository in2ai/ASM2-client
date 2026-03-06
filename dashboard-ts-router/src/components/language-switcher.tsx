import { Check, Languages } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type AppLocale } from '@/i18n/config'
import { useI18nContext } from '@/i18n/provider'
import { useTranslations } from 'next-intl'

const languageOptions: ReadonlyArray<{ value: AppLocale }> = [
  { value: 'es' },
  { value: 'en' },
  { value: 'gl' },
]

export function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher')
  const optionLabels: Record<AppLocale, string> = {
    es: t('spanish'),
    en: t('english'),
    gl: t('galician'),
  }

  const { locale, setLocale } = useI18nContext()

  const handleSelectLocale = (nextLocale: AppLocale) => {
    if (nextLocale === locale) {
      return
    }

    setLocale(nextLocale)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="bg-muted/50 hover:bg-muted h-9 w-9 rounded-xl transition-colors"
          aria-label={t('ariaLabel')}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t('ariaLabel')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {languageOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelectLocale(option.value)}
            className="flex cursor-pointer items-center gap-2"
          >
            <span>{optionLabels[option.value]}</span>
            {locale === option.value && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
