import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { useTranslations } from 'next-intl'

/** Shown for a URL no route claims, instead of an empty page. */
export function NotFound() {
  const t = useTranslations('NotFound')

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="bg-muted text-muted-foreground mb-5 rounded-2xl p-4">
        <Compass className="h-8 w-8" />
      </div>
      <p className="text-2xl font-semibold tracking-tight">{t('title')}</p>
      <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
        {t('description')}
      </p>
      <Button asChild className="mt-6 rounded-2xl">
        <Link to="/">{t('backHome')}</Link>
      </Button>
    </div>
  )
}
