import { UserMenu } from '@/app/_components/app-layout'
import { AreaSwitcher } from '@/app/_components/area-switcher'
import { Button } from '@/components/ui/button'
import { IndexingAlertCenter } from '@/features/indexing-alerts/indexing-alert-center'
import { IndexingProgressIndicator } from '@/features/indexing-progress/indexing-progress-indicator'
import { useHotkeys } from '@/hooks/use-hotkeys'
import { useIsDesktop } from '@/hooks/use-media-query'
import { useDrawerFocus } from '@/hooks/use-drawer-focus'
import type { LogtoUser } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Menu, MessageSquareText, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

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
  const isDesktop = useIsDesktop()
  const drawerOpen = !isDesktop && sidebarOpen
  const drawerRef = useDrawerFocus(drawerOpen)

  // Past the breakpoint the sidebar is a column, not a drawer, and the scrim
  // the drawer leaves behind would sit over the whole conversation.
  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(false)
    }
  }, [isDesktop])

  useHotkeys([
    { key: 'b', mod: true, onPress: () => setSidebarOpen((open) => !open) },
    { key: 'Escape', onPress: () => setSidebarOpen(false) },
  ])

  return (
    <div className="bg-background flex h-dvh overflow-hidden">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label={closeSidebarLabel}
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        ref={drawerRef}
        inert={!isDesktop && !sidebarOpen}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={openSidebarLabel}
        className={cn(
          'bg-card fixed inset-y-0 left-0 z-50 flex w-80 max-w-[calc(100vw-1rem)] flex-col border-r shadow-xl transition-transform duration-300 lg:static lg:max-w-none lg:translate-x-0 lg:shadow-none',
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

      <div
        inert={drawerOpen}
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
      >
        {/* Flat on purpose: wrapped in a shrinking group with the title, the
            menu button was squeezed to nothing on a phone and the actions
            drew over it. As its own item it keeps its width, and the title,
            which has no room there anyway (as in the dashboard), steps out. */}
        <header className="bg-background/60 flex h-16 shrink-0 items-center gap-1 border-b px-2 backdrop-blur-md sm:gap-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="bg-muted/50 hover:bg-muted h-10 w-10 shrink-0 rounded-xl transition-colors lg:hidden"
            onClick={() => setSidebarOpen((current) => !current)}
            aria-label={openSidebarLabel}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="hidden min-w-0 flex-1 truncate text-base font-semibold tracking-tight sm:block">
            {title}
          </h1>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
            {headerActions}
            <IndexingProgressIndicator user={user} />
            <IndexingAlertCenter user={user} />
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
