import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const t = useTranslations('ThemeToggle')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="bg-muted/50 hover:bg-muted relative h-9 w-9 rounded-xl transition-colors"
          aria-label={t('ariaLabel')}
        >
          <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">{t('ariaLabel')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex cursor-pointer items-center gap-2"
        >
          <Sun className="h-4 w-4" />
          <span>{t('light')}</span>
          {theme === 'light' && (
            <span className="bg-primary ml-auto h-1.5 w-1.5 rounded-full" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex cursor-pointer items-center gap-2"
        >
          <Moon className="h-4 w-4" />
          <span>{t('dark')}</span>
          {theme === 'dark' && (
            <span className="bg-primary ml-auto h-1.5 w-1.5 rounded-full" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="flex cursor-pointer items-center gap-2"
        >
          <Monitor className="h-4 w-4" />
          <span>{t('system')}</span>
          {theme === 'system' && (
            <span className="bg-primary ml-auto h-1.5 w-1.5 rounded-full" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
