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

type View = "usage" | "rag-quality" | "performance" | "insights";

interface AppLayoutProps {
  readonly children: (view: View) => ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [currentView, setCurrentView] = useState<View>("usage");
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
      <div className="bg-muted/10 flex h-screen overflow-hidden">
        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "bg-background fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-transform duration-300 lg:static lg:translate-x-0",
            // Mobile: slide in from left
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
            // Desktop: collapsible width
            "lg:transition-all lg:duration-300",
            sidebarOpen ? "w-72" : "w-72 lg:w-20",
          )}
        >
          <div className="flex h-16 items-center border-b px-4">
            <BarChart3 className="text-primary mr-2 h-6 w-6 shrink-0" />
            {sidebarOpen ? (
              <span className="truncate text-lg font-semibold">
                ACM2 Metrics
              </span>
            ) : null}
            {/* Close button for mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            <NavItem
              icon={BarChart3}
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
              icon={TrendingUp}
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
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <header className="bg-background flex h-16 items-center justify-between border-b px-3 sm:px-4 md:px-6">
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              {/* Hamburger menu for mobile, collapse toggle for desktop */}
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => {
                  // Mobile: toggle mobile menu
                  // Desktop: toggle sidebar collapse
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
                <h1 className="text-base leading-tight font-semibold sm:text-lg">
                  Dashboard de Métricas
                </h1>
                <p className="text-muted-foreground hidden text-xs md:block">
                  Uso, calidad del RAG, rendimiento e insights
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
              <CompanyDisplay user={user} />
              <ViewSwitcher value={currentView} onChange={handleViewChange} />
              <ChartVisibilityControls view={currentView} />
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
        "flex min-h-[44px] w-full items-center justify-start gap-3 px-3 py-2 text-sm font-medium",
        !active && "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
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
