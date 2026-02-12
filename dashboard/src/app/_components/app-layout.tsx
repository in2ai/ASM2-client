"use client";

import {
  DASHBOARD_VIEWS,
  type DashboardView,
} from "@/app/_components/dashboard-views";
import { signOutAction } from "@/app/actions/auth";
import { ChartVisibilityControls } from "@/components/chart-visibility-controls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChartVisibilityProvider } from "@/contexts/chart-visibility-context";
import { type LogtoUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Building2,
  Loader2,
  LogOut,
  Menu,
  Shield,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface AppLayoutProps {
  readonly children: ReactNode;
  readonly user: LogtoUser | null;
  readonly view: DashboardView;
  readonly onViewChange: (view: DashboardView) => void;
}

export function AppLayout({
  children,
  user,
  view,
  onViewChange,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleViewChange = useCallback(
    (nextView: DashboardView) => {
      onViewChange(nextView);
      setMobileMenuOpen(false);
    },
    [onViewChange],
  );

  const handleSidebarToggle = useCallback(() => {
    if (globalThis.innerWidth < 1024) {
      setMobileMenuOpen((current) => !current);
      return;
    }

    setSidebarOpen((current) => !current);
  }, []);

  return (
    <ChartVisibilityProvider>
      <div className="bg-background flex h-screen overflow-hidden">
        {mobileMenuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Cerrar menú lateral"
          />
        )}

        <aside
          className={cn(
            "bg-card/40 fixed inset-y-0 left-0 z-50 flex flex-col border-r shadow-xl backdrop-blur-xl transition-all duration-300 lg:static lg:translate-x-0 lg:shadow-none",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
            sidebarOpen ? "w-64" : "w-64 lg:w-20",
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
              aria-label="Cerrar menú lateral"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Cerrar menú lateral</span>
            </Button>
          </div>

          <div className="flex flex-1 flex-col justify-between p-3">
            <nav className="space-y-1">
              {DASHBOARD_VIEWS.map((dashboardView) => (
                <NavItem
                  key={dashboardView.key}
                  icon={dashboardView.icon}
                  label={dashboardView.sidebarLabel}
                  active={view === dashboardView.key}
                  onClick={() => handleViewChange(dashboardView.key)}
                  collapsed={!sidebarOpen}
                />
              ))}
            </nav>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="bg-background/40 flex h-16 items-center justify-between border-b px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="bg-muted/50 hover:bg-muted h-10 w-10 rounded-xl transition-colors"
                onClick={handleSidebarToggle}
                aria-label={
                  mobileMenuOpen
                    ? "Cerrar menú de navegación"
                    : "Abrir menú de navegación"
                }
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">
                  {mobileMenuOpen
                    ? "Cerrar menú de navegación"
                    : "Abrir menú de navegación"}
                </span>
              </Button>
              <div className="hidden sm:block">
                <h1 className="text-sm font-bold tracking-tight md:text-base">
                  Dashboard de Métricas
                </h1>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="h-4 border-emerald-500/20 bg-emerald-500/10 px-1 text-[8px] font-bold text-emerald-500 uppercase"
                  >
                    Live
                  </Badge>
                  <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                    Real-time analysis
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <CompanyDisplay user={user} />
              <div className="bg-border/60 mx-1 hidden h-8 w-px md:block" />
              <ViewSwitcher value={view} onChange={handleViewChange} />
              {view !== "overview" ? (
                <ChartVisibilityControls view={view} />
              ) : null}
              <ThemeToggle />
              <UserMenu user={user} />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ChartVisibilityProvider>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  collapsed,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}>) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 w-full items-center justify-start gap-4 px-3 py-2 text-sm font-semibold transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-primary/20 shadow-lg"
          : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-transform group-hover:scale-110",
          active && "text-primary-foreground",
        )}
      />
      {!collapsed && <span className="truncate tracking-tight">{label}</span>}
      {active && !collapsed && (
        <div className="bg-primary-foreground absolute right-2 h-1 w-1 rounded-full" />
      )}
    </Button>
  );
}

function ViewSwitcher({
  value,
  onChange,
}: Readonly<{
  value: DashboardView;
  onChange: (view: DashboardView) => void;
}>) {
  return (
    <div className="bg-muted inline-flex rounded-full p-1">
      {DASHBOARD_VIEWS.map((dashboardView) => (
        <Button
          key={dashboardView.key}
          size="sm"
          variant={value === dashboardView.key ? "default" : "ghost"}
          aria-pressed={value === dashboardView.key}
          className={cn(
            "min-h-9 min-w-9 rounded-full px-2 text-xs sm:min-w-0 sm:px-3",
            value !== dashboardView.key && "text-muted-foreground",
          )}
          onClick={() => onChange(dashboardView.key)}
        >
          <span className="hidden sm:inline">
            {dashboardView.switcherLabel}
          </span>
          <span className="sm:hidden">{dashboardView.switcherShortLabel}</span>
        </Button>
      ))}
    </div>
  );
}

function CompanyDisplay({ user }: Readonly<{ user: LogtoUser | null }>) {
  if (!user) {
    return null;
  }

  return (
    <div className="text-muted-foreground hidden items-center gap-2 text-sm md:flex">
      <User className="h-4 w-4" />
      <span className="font-medium">{user.email}</span>
    </div>
  );
}

function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors outline-none data-disabled:pointer-events-none data-disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      <span>{pending ? "Cerrando sesión…" : "Cerrar sesión"}</span>
    </button>
  );
}

function getInitials(user: LogtoUser | null): string {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  if (user?.email) {
    return user.email.substring(0, 2).toUpperCase();
  }
  return "U";
}

function getDisplayName(user: LogtoUser | null): string {
  if (user?.firstName && user?.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user?.firstName) {
    return user.firstName;
  }
  return "Usuario";
}

function UserMenu({ user }: Readonly<{ user: LogtoUser | null }>) {
  const displayName = getDisplayName(user);
  const initials = getInitials(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 min-h-11 w-10 min-w-11 rounded-full"
          aria-label="Abrir menú de usuario"
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
              {user?.role === "admin" ? (
                <Badge variant="default" className="ml-2 gap-1">
                  <Shield className="h-3 w-3" />
                  Admin
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-2 gap-1">
                  <User className="h-3 w-3" />
                  Usuario
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-xs leading-none">
              {user?.email ?? "usuario@empresa.com"}
            </p>
            {user?.role !== "admin" && user?.organizationId && (
              <p className="text-muted-foreground flex items-center gap-1 text-xs leading-none">
                <Building2 className="h-3 w-3" />
                {user.organizationId}
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />
        <form action={signOutAction} className="w-full">
          <SignOutButton />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
