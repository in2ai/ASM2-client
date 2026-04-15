import { CompanyDisplay, UserMenu } from '@/app/_components/app-layout'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { type LogtoUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { BarChart3, Menu, MessageSquareText, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface ChatShellProps {
  canAccessDashboard?: boolean
  closeSidebarLabel: string
  children: ReactNode
  dashboardLabel: string
  headerActions?: ReactNode
  openSidebarLabel: string
  sidebar: ReactNode
  subtitle: string
  title: string
  user: LogtoUser
}

export function ChatShell({
  canAccessDashboard = false,
  closeSidebarLabel,
  children,
  dashboardLabel,
  headerActions,
  openSidebarLabel,
  sidebar,
  subtitle,
  title,
  user,
}: Readonly<ChatShellProps>) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label={closeSidebarLabel}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'bg-card/40 fixed inset-y-0 left-0 z-50 flex w-80 flex-col border-r shadow-xl backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 lg:shadow-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center px-6">
          <div className="bg-primary shadow-primary/25 flex h-10 w-10 items-center justify-center rounded-xl shadow-lg">
            <MessageSquareText className="text-primary-foreground h-5 w-5" />
          </div>
          <span className="ml-3 truncate text-lg font-black tracking-tighter">Chat</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label={closeSidebarLabel}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {canAccessDashboard ? (
          <div className="px-3 pb-3">
            <Button asChild variant="ghost" className="h-11 w-full justify-start gap-2 rounded-2xl">
              <Link to="/">
                <BarChart3 className="h-4 w-4" />
                <span>{dashboardLabel}</span>
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">{sidebar}</div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="bg-background/40 flex h-16 items-center justify-between border-b px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="bg-muted/50 hover:bg-muted h-10 w-10 rounded-xl transition-colors lg:hidden"
              onClick={() => setSidebarOpen((current) => !current)}
              aria-label={openSidebarLabel}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-sm font-bold tracking-tight md:text-base">{title}</h1>
              <p className="text-muted-foreground text-xs">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {headerActions}
            <CompanyDisplay user={user} />
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
