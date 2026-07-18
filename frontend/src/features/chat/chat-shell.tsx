import { UserMenu } from '@/app/_components/app-layout'
import { AreaSwitcher } from '@/app/_components/area-switcher'
import { Button } from '@/components/ui/button'
import type { LogtoUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Menu, MessageSquareText, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

interface ChatShellProps {
  closeSidebarLabel: string
  children: ReactNode
  headerActions?: ReactNode
  openSidebarLabel: string
  sidebar: ReactNode
  title: string
  user: LogtoUser
}

export function ChatShell({
  closeSidebarLabel,
  children,
  headerActions,
  openSidebarLabel,
  sidebar,
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
          <span className="ml-3 truncate text-lg font-black tracking-tighter">
            Chat
          </span>
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

        <div className="min-h-0 flex-1">{sidebar}</div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="bg-background/60 flex h-16 items-center justify-between gap-3 border-b px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="bg-muted/50 hover:bg-muted h-10 w-10 shrink-0 rounded-xl transition-colors lg:hidden"
              onClick={() => setSidebarOpen((current) => !current)}
              aria-label={openSidebarLabel}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="min-w-0 truncate text-base font-semibold tracking-tight">
              {title}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {headerActions}
            <AreaSwitcher activeArea="chat" user={user} />
            {user.role === 'admin' ? (
              <div className="bg-border mx-1 hidden h-6 w-px sm:block" />
            ) : null}
            <UserMenu user={user} showPreferences />
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
