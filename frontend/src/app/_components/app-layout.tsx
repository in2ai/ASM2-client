import type { ReactNode } from 'react'
import { useState } from 'react'

import { AreaSwitcher } from '@/app/_components/area-switcher'
import type { DashboardView } from '@/app/_components/dashboard-views'
import { DASHBOARD_VIEWS } from '@/app/_components/dashboard-views'
import { ChartVisibilityControls } from '@/components/chart-visibility-controls'
import { LanguageMenuSection } from '@/components/language-switcher'
import { ThemeMenuSection } from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChartVisibilityProvider } from '@/contexts/chart-visibility-context'
import type { LogtoUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useLogto } from '@logto/react'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, Loader2, LogOut, Menu, Shield, User, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface AppLayoutProps {
  readonly children: ReactNode
  readonly user: LogtoUser | null
  readonly view: DashboardView
  readonly onViewChange: (view: DashboardView) => void
}

export function AppLayout({
  children,
  user,
  view,
  onViewChange,
}: AppLayoutProps) {
  const t = useTranslations('AppLayout')

  const viewLabels: Record<DashboardView, string> = {
    overview: t('views.overview'),
    usage: t('views.usage'),
    'rag-quality': t('views.ragQuality'),
    insights: t('views.insights'),
  }

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleViewChange = (nextView: DashboardView) => {
    onViewChange(nextView)
    setMobileMenuOpen(false)
  }

  const handleSidebarToggle = () => {
    if (window.innerWidth < 1024) {
      setMobileMenuOpen((current) => !current)
      return
    }

    setSidebarOpen((current) => !current)
  }

  return (
    <ChartVisibilityProvider>
      <div className="bg-background flex h-screen overflow-hidden">
        {mobileMenuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={t('closeSidebarMenu')}
          />
        )}

        <aside
          className={cn(
            'bg-card/40 fixed inset-y-0 left-0 z-50 flex flex-col border-r shadow-xl backdrop-blur-xl transition-all duration-300 lg:static lg:translate-x-0 lg:shadow-none',
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
            sidebarOpen ? 'w-64' : 'w-64 lg:w-20',
          )}
        >
          <div className="flex h-16 items-center px-6">
            <div className="bg-primary shadow-primary/25 flex h-10 w-10 items-center justify-center rounded-xl shadow-lg">
              <BarChart3 className="text-primary-foreground h-5 w-5" />
            </div>
            {sidebarOpen ? (
              <span className="ml-3 truncate text-lg font-black tracking-tighter">
                ASM<span className="text-primary">2</span>
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label={t('closeSidebarMenu')}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">{t('closeSidebarMenu')}</span>
            </Button>
          </div>

          <div className="flex flex-1 flex-col justify-between p-3">
            <nav className="space-y-1">
              {DASHBOARD_VIEWS.map((dashboardView) => (
                <NavItem
                  key={dashboardView.key}
                  icon={dashboardView.icon}
                  label={viewLabels[dashboardView.key]}
                  active={view === dashboardView.key}
                  onClick={() => handleViewChange(dashboardView.key)}
                  collapsed={!sidebarOpen}
                />
              ))}
            </nav>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="bg-background/60 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-md sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="bg-muted/50 hover:bg-muted h-10 w-10 shrink-0 rounded-xl transition-colors"
                onClick={handleSidebarToggle}
                aria-label={
                  mobileMenuOpen
                    ? t('closeNavigationMenu')
                    : t('openNavigationMenu')
                }
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">
                  {mobileMenuOpen
                    ? t('closeNavigationMenu')
                    : t('openNavigationMenu')}
                </span>
              </Button>
              <div className="hidden min-w-0 sm:block">
                <h1 className="truncate text-sm font-bold tracking-tight md:text-base">
                  {t('title')}
                </h1>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="h-4 border-emerald-500/20 bg-emerald-500/10 px-1 text-[8px] font-bold text-emerald-500 uppercase"
                  >
                    {t('live')}
                  </Badge>
                  <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                    {t('realTimeAnalysis')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <AreaSwitcher activeArea="dashboard" user={user} />
              {view !== 'overview' ? (
                <ChartVisibilityControls view={view} />
              ) : null}
              <div className="bg-border mx-1 hidden h-6 w-px sm:block" />
              <UserMenu user={user} showPreferences />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ChartVisibilityProvider>
  )
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  collapsed,
}: Readonly<{
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
  collapsed?: boolean
}>) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-11 w-full items-center justify-start gap-4 px-3 py-2 text-sm font-semibold transition-all',
        active
          ? 'bg-primary text-primary-foreground shadow-primary/20 shadow-lg'
          : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground',
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 shrink-0 transition-transform group-hover:scale-110',
          active && 'text-primary-foreground',
        )}
      />
      {!collapsed && <span className="truncate tracking-tight">{label}</span>}
      {active && !collapsed && (
        <div className="bg-primary-foreground absolute right-2 h-1 w-1 rounded-full" />
      )}
    </Button>
  )
}

function getInitials(user: LogtoUser | null): string {
  if (user?.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  }
  if (user?.email) {
    return user.email.substring(0, 2).toUpperCase()
  }
  return 'U'
}

function getDisplayName(user: LogtoUser | null, fallbackName: string): string {
  if (user?.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`
  }
  if (user?.firstName) {
    return user.firstName
  }
  return fallbackName
}

export function UserMenu({
  user,
  showPreferences = false,
}: Readonly<{ user: LogtoUser | null; showPreferences?: boolean }>) {
  const t = useTranslations('AppLayout')
  const { signOut } = useLogto()
  const [pending, setPending] = useState(false)

  const displayName = getDisplayName(user, t('userFallbackName'))
  const initials = getInitials(user)

  const handleSignOut = async () => {
    try {
      setPending(true)
      await signOut(`${globalThis.location.origin}/sign-in`)
    } finally {
      setPending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 min-h-11 w-10 min-w-11 rounded-full"
          aria-label={t('openUserMenu')}
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm leading-none font-medium">{displayName}</p>
              {user?.role === 'admin' ? (
                <Badge variant="default" className="ml-2 gap-1">
                  <Shield className="h-3 w-3" />
                  {t('admin')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-2 gap-1">
                  <User className="h-3 w-3" />
                  {t('user')}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs leading-none">
              {user?.email ?? t('fallbackEmail')}
            </p>
          </div>
        </DropdownMenuLabel>

        {showPreferences ? (
          <>
            <DropdownMenuSeparator />
            <LanguageMenuSection />
            <ThemeMenuSection />
          </>
        ) : null}

        <DropdownMenuSeparator />
        <button
          type="button"
          disabled={pending}
          onClick={() => void handleSignOut()}
          className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors outline-none data-disabled:pointer-events-none data-disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          <span>{pending ? t('signingOut') : t('signOut')}</span>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
