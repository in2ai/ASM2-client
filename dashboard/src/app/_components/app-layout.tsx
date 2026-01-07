"use client";

import { signOutAction } from "@/app/actions/auth";
import { ChartVisibilityControls } from "@/components/chart-visibility-controls";
import { PreferencesDialog } from "@/components/preferences-dialog";
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
import { ChartVisibilityProvider } from "@/contexts/chart-visibility-context";
import { cn } from "@/lib/utils";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import {
  Activity,
  BarChart3,
  Building2,
  Loader2,
  LogOut,
  Menu,
  Shield,
  Sparkles,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { useState, type ElementType, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type View = "overview" | "usage" | "rag-quality" | "performance" | "insights";

interface AppLayoutProps {
  readonly children: (view: View) => ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [currentView, setCurrentView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();

  // Close mobile menu when view changes
  const handleViewChange = (view: View) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  return (
    <ChartVisibilityProvider>
      <div className="dark:via-background flex h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_right,var(--tw-gradient-stops))] from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:to-slate-950">
        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "bg-card/40 fixed inset-y-0 left-0 z-50 flex flex-col border-r shadow-xl backdrop-blur-xl transition-all duration-300 lg:static lg:translate-x-0 lg:shadow-none",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
            sidebarOpen ? "w-64" : "w-64 lg:w-20",
          )}
        >
          <div className="flex h-16 items-center px-6">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
              <BarChart3 className="text-primary h-6 w-6" />
            </div>
            {sidebarOpen ? (
              <span className="ml-3 truncate text-lg font-black tracking-tighter">
                ASM2<span className="text-primary">METRICS</span>
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex flex-1 flex-col justify-between p-3">
            <nav className="space-y-1">
              <NavItem
                icon={BarChart3}
                label="Vista General"
                active={currentView === "overview"}
                onClick={() => handleViewChange("overview")}
                collapsed={!sidebarOpen}
              />
              <NavItem
                icon={TrendingUp}
                label="Uso e Interacción"
                active={currentView === "usage"}
                onClick={() => handleViewChange("usage")}
                collapsed={!sidebarOpen}
              />
              <NavItem
                icon={Activity}
                label="Calidad del RAG"
                active={currentView === "rag-quality"}
                onClick={() => handleViewChange("rag-quality")}
                collapsed={!sidebarOpen}
              />
              <NavItem
                icon={Shield}
                label="Rendimiento"
                active={currentView === "performance"}
                onClick={() => handleViewChange("performance")}
                collapsed={!sidebarOpen}
              />
              <NavItem
                icon={Sparkles}
                label="Insights"
                active={currentView === "insights"}
                onClick={() => handleViewChange("insights")}
                collapsed={!sidebarOpen}
              />
            </nav>

            {sidebarOpen && (
              <div className="bg-primary/5 mb-4 rounded-xl p-4">
                <p className="text-muted-foreground text-[10px] font-bold tracking-widest uppercase">
                  Version
                </p>
                <p className="mt-1 text-xs font-medium">v2.4.0-production</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <header className="bg-background/40 flex h-16 items-center justify-between border-b px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="bg-muted/50 hover:bg-muted h-10 w-10 rounded-xl transition-colors"
                onClick={() => {
                  if (window.innerWidth < 1024) {
                    setMobileMenuOpen(!mobileMenuOpen);
                  } else {
                    setSidebarOpen(!sidebarOpen);
                  }
                }}
              >
                <Menu className="h-5 w-5" />
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
              <ViewSwitcher value={currentView} onChange={handleViewChange} />
              {currentView !== "overview" && (
                <ChartVisibilityControls view={currentView} />
              )}
              <UserMenu user={user} />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            {children(currentView)}
          </main>
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
  icon: ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}>) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      onClick={onClick}
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
  value: View;
  onChange: (v: View) => void;
}>) {
  const views: { key: View; label: string; shortLabel: string }[] = [
    { key: "overview", label: "General", shortLabel: "Gen" },
    { key: "usage", label: "Uso", shortLabel: "Uso" },
    { key: "rag-quality", label: "RAG", shortLabel: "RAG" },
    { key: "performance", label: "Rendimiento", shortLabel: "Perf" },
    { key: "insights", label: "Insights", shortLabel: "Ins" },
  ];

  return (
    <div className="bg-muted inline-flex rounded-full p-1">
      {views.map((v) => (
        <Button
          key={v.key}
          size="sm"
          variant={value === v.key ? "default" : "ghost"}
          className={cn(
            "min-h-[36px] min-w-[36px] rounded-full px-2 text-xs sm:min-w-0 sm:px-3",
            value !== v.key && "text-muted-foreground",
          )}
          onClick={() => onChange(v.key)}
        >
          <span className="hidden sm:inline">{v.label}</span>
          <span className="sm:hidden">{v.shortLabel}</span>
        </Button>
      ))}
    </div>
  );
}

interface WorkOSUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}

function CompanyDisplay({ user }: Readonly<{ user: WorkOSUser | null }>) {
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
      <span>{pending ? "Cerrando sesión..." : "Cerrar sesión"}</span>
    </button>
  );
}

function UserMenu({ user }: Readonly<{ user: WorkOSUser | null }>) {
  const getInitials = (): string => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  const getDisplayName = (): string => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    return "Usuario";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 min-h-[44px] w-10 min-w-[44px] rounded-full"
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-sm leading-none font-medium">
                {getDisplayName()}
              </p>
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
        <div className="px-2 py-1.5">
          <PreferencesDialog />
        </div>
        <DropdownMenuSeparator />
        <form action={signOutAction} className="w-full">
          <SignOutButton />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
