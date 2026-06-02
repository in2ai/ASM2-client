import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { LucideIcon } from 'lucide-react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'

const themeOptions: ReadonlyArray<{
  value: string
  icon: LucideIcon
  labelKey: 'light' | 'dark' | 'system'
}> = [
  { value: 'light', icon: Sun, labelKey: 'light' },
  { value: 'dark', icon: Moon, labelKey: 'dark' },
  { value: 'system', icon: Monitor, labelKey: 'system' },
]

function ThemeOptionItems() {
  const { setTheme, theme } = useTheme()
  const t = useTranslations('ThemeToggle')

  return (
    <>
      {themeOptions.map(({ value, icon: Icon, labelKey }) => (
        <DropdownMenuItem
          key={value}
          onClick={() => setTheme(value)}
          className="flex cursor-pointer items-center gap-2"
        >
          <Icon className="h-4 w-4" />
          <span>{t(labelKey)}</span>
          {theme === value && (
            <span className="bg-primary ml-auto h-1.5 w-1.5 rounded-full" />
          )}
        </DropdownMenuItem>
      ))}
    </>
  )
}

export function ThemeMenuSection() {
  const t = useTranslations('ThemeToggle')

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span>{t('ariaLabel')}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        <ThemeOptionItems />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function ThemeToggle() {
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
      <DropdownMenuContent align="end" className="min-w-40">
        <ThemeOptionItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
