import { Button } from '@/components/ui/button'
import type { LogtoUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, MessageSquareText } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Area = 'chat' | 'dashboard'

interface AreaSwitcherProps {
  readonly activeArea: Area
  readonly user: LogtoUser | null
}

export function AreaSwitcher({
  activeArea,
  user,
}: Readonly<AreaSwitcherProps>) {
  const t = useTranslations('AreaSwitcher')

  if (user?.role !== 'admin') {
    return null
  }

  return (
    <nav
      aria-label={t('label')}
      className="bg-muted/50 inline-flex items-center gap-1 rounded-2xl p-1"
    >
      <AreaSwitcherItem
        to="/chat"
        icon={MessageSquareText}
        label={t('chat')}
        active={activeArea === 'chat'}
      />
      <AreaSwitcherItem
        to="/"
        icon={BarChart3}
        label={t('dashboard')}
        active={activeArea === 'dashboard'}
      />
    </nav>
  )
}

function AreaSwitcherItem({
  to,
  icon: Icon,
  label,
  active,
}: Readonly<{
  to: '/' | '/chat'
  icon: LucideIcon
  label: string
  active: boolean
}>) {
  return (
    <Button
      asChild
      variant={active ? 'default' : 'ghost'}
      size="sm"
      aria-current={active ? 'page' : undefined}
      className={cn(
        'h-9 gap-2 rounded-xl px-3 text-sm font-semibold transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-primary/20 shadow-lg'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Link to={to}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">{label}</span>
      </Link>
    </Button>
  )
}
