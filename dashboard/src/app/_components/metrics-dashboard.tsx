"use client";

import { DateRangeSelector } from "@/components/date-range-selector";
import { NoMetricsEmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ExportButton } from "@/components/export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";
import { useMemo, useState, type ElementType } from "react";
import { type DateRange } from "react-day-picker";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "./app-layout";

const roleChartConfig: ChartConfig = {
  admin: { label: "Admin", color: "hsl(11 84% 60%)" },
  user: { label: "User", color: "hsl(199 89% 62%)" },
  viewer: { label: "Viewer", color: "hsl(330 72% 65%)" },
  manager: { label: "Manager", color: "hsl(43 92% 58%)" },
  other: { label: "Other", color: "hsl(215 20% 65%)" },
};

const methodChartConfig: ChartConfig = {
  GET: { label: "GET", color: "hsl(142 70% 45%)" },
  POST: { label: "POST", color: "hsl(221 83% 53%)" },
  PUT: { label: "PUT", color: "hsl(43 92% 58%)" },
  DELETE: { label: "DELETE", color: "hsl(0 84% 60%)" },
  PATCH: { label: "PATCH", color: "hsl(262 83% 68%)" },
  other: { label: "Other", color: "hsl(215 20% 65%)" },
};

const statusChartConfig: ChartConfig = {
  "2xx": { label: "Success (2xx)", color: "hsl(142 70% 45%)" },
  "3xx": { label: "Redirect (3xx)", color: "hsl(199 89% 62%)" },
  "4xx": { label: "Client Error (4xx)", color: "hsl(43 92% 58%)" },
  "5xx": { label: "Server Error (5xx)", color: "hsl(0 84% 60%)" },
};

const activityChartConfig: ChartConfig = {
  event_count: { label: "Eventos", color: "oklch(0.6 0.25 250)" },
  unique_users: { label: "Usuarios únicos", color: "oklch(0.7 0.2 150)" },
};

const requestsChartConfig: ChartConfig = {
  request_count: { label: "Peticiones", color: "oklch(0.6 0.25 250)" },
  error_count: { label: "Errores", color: "oklch(0.6 0.25 20)" },
};

const latencyChartConfig: ChartConfig = {
  count: { label: "Peticiones", color: "oklch(0.7 0.2 300)" },
};

const hourlyChartConfig: ChartConfig = {
  event_count: { label: "Actividad", color: "oklch(0.7 0.2 200)" },
};

const getDateFormatter = () =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });

type MetricsResponse = RouterOutputs["metrics"]["get"];
type StatsResponse = RouterOutputs["metrics"]["getStats"];

interface WorkOSUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  trend,
}: Readonly<{
  label: string;
  value: string;
  helper?: string;
  icon: ElementType;
  trend?: { value: string; positive: boolean };
}>) {
  return (
    <Card className="relative overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] grayscale transition-opacity hover:opacity-[0.08]">
        <Icon size={80} />
      </div>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="bg-primary/10 text-primary rounded-lg p-2">
            <Icon size={18} />
          </div>
          {trend && (
            <Badge
              variant={trend.positive ? "default" : "destructive"}
              className={cn(
                "h-5 px-1 text-[10px] font-bold",
                trend.positive &&
                  "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20",
              )}
            >
              {trend.value}
            </Badge>
          )}
        </div>
        <CardDescription className="text-muted-foreground mt-2 text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-black tracking-tight lg:text-3xl">
          {value}
        </CardTitle>
      </CardHeader>
      {helper ? (
        <CardContent className="p-4 pt-0">
          <p className="text-muted-foreground text-[10px] font-medium">
            {helper}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function StatsRow({ metrics }: Readonly<{ metrics: MetricsResponse }>) {
  const userActivity = metrics.user_activity;
  const requestStats = metrics.request_stats;
  const metricsData = metrics.metrics;

  const uniqueUsers = userActivity.unique_users.toLocaleString("es-ES");
  const totalEvents = userActivity.total_events.toLocaleString("es-ES");
  const avgSession = userActivity.mean_session_length_seconds
    ? (userActivity.mean_session_length_seconds / 60).toFixed(1)
    : "0.0";
  const avgLatency = requestStats.avg_latency
    ? requestStats.avg_latency.toFixed(0)
    : "0";
  const totalRequests = requestStats.total_requests.toLocaleString("es-ES");
  const errorRate = metrics.error_rate.toFixed(1);
  const ragLatency = metricsData.response_time
    ? metricsData.response_time.toFixed(0)
    : "0";
  const totalMetrics = metricsData.total_count.toLocaleString("es-ES");

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <StatCard
        label="Usuarios únicos"
        value={uniqueUsers}
        helper="En el período"
        icon={User}
      />
      <StatCard
        label="Eventos totales"
        value={totalEvents}
        helper="Interacciones"
        icon={Activity}
      />
      <StatCard
        label="Sesión media"
        value={`${avgSession}m`}
        helper="Tiempo de uso"
        icon={Clock}
      />
      <StatCard
        label="Latencia red"
        value={`${avgLatency}ms`}
        helper="Respuesta servidor"
        icon={Zap}
      />
      <StatCard
        label="Peticiones"
        value={totalRequests}
        helper="Total sistema"
        icon={TrendingUp}
      />
      <StatCard
        label="Tasa de error"
        value={`${errorRate}%`}
        helper="Respuestas fallidas"
        icon={AlertCircle}
        trend={{
          value: `${errorRate}%`,
          positive: Number.parseFloat(errorRate) < 5,
        }}
      />
      <StatCard
        label="Latencia RAG"
        value={`${ragLatency}ms`}
        helper="Respuesta LLM"
        icon={Sparkles}
      />
      <StatCard
        label="Métricas RAG"
        value={totalMetrics}
        helper="Registros totales"
        icon={Database}
      />
    </div>
  );
}

function OverviewHighlights({
  metrics,
}: Readonly<{ metrics: MetricsResponse }>) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Vista General</h2>
        <p className="text-muted-foreground text-sm">
          Resumen de los indicadores clave de rendimiento
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <StatsRow metrics={metrics} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">
                Actividad Reciente
              </CardTitle>
              <CardDescription>Eventos en los últimos días</CardDescription>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <Activity size={18} />
            </div>
          </CardHeader>
          <CardContent className="h-[300px] p-0 pt-4">
            <ChartContainer
              config={{
                event_count: { label: "Eventos", color: "oklch(0.6 0.25 250)" },
              }}
              className="h-full w-full"
            >
              <AreaChart
                data={metrics.user_activity.by_day.slice(-7).map((item) => ({
                  ...item,
                  date: new Date(item.date).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                  }),
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="fillOverviewEvents"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-event_count)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-event_count)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: 10 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: 10 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="event_count"
                  stroke="var(--color-event_count)"
                  fill="url(#fillOverviewEvents)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold">
                Rendimiento Sistema
              </CardTitle>
              <CardDescription>Peticiones y errores recientes</CardDescription>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <Zap size={18} />
            </div>
          </CardHeader>
          <CardContent className="h-[300px] p-0 pt-4">
            <ChartContainer
              config={{
                request_count: {
                  label: "Peticiones",
                  color: "oklch(0.6 0.25 250)",
                },
                error_count: { label: "Errores", color: "oklch(0.6 0.25 20)" },
              }}
              className="h-full w-full"
            >
              <LineChart
                data={metrics.request_stats.by_day.slice(-7).map((item) => ({
                  ...item,
                  date: new Date(item.date).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                  }),
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: 10 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: 10 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="request_count"
                  stroke="var(--color-request_count)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="error_count"
                  stroke="var(--color-error_count)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function isEmptyData(data: MetricsResponse): boolean {
  return (
    data?.user_activity?.total_events === 0 &&
    data?.user_activity?.unique_users === 0 &&
    data?.request_stats?.total_requests === 0
  );
}

function getErrorTitle(error: unknown): string {
  if (!error) return "Error Loading Metrics";

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("You must be logged in")
  ) {
    return "Unauthorized Access";
  }

  if (
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return "Access Denied";
  }

  if (errorMessage.includes("NOT_FOUND")) {
    return "Data Not Found";
  }

  if (
    errorMessage.includes("TIMEOUT") ||
    errorMessage.includes("took too long")
  ) {
    return "Request Timeout";
  }

  if (
    errorMessage.includes("INTERNAL_SERVER_ERROR") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Failed to calculate")
  ) {
    return "Server Error";
  }

  return "Error Loading Metrics";
}

function getErrorMessage(error: unknown): string {
  if (!error)
    return "No se pudieron recuperar los datos. Por favor, intenta nuevamente.";

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("You must be logged in")
  ) {
    return "No tienes autorización para acceder a estos datos. Por favor, inicia sesión nuevamente.";
  }

  if (
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return "No tienes permisos para acceder a este recurso. Contacta a tu administrador si crees que esto es un error.";
  }

  if (errorMessage.includes("NOT_FOUND")) {
    return errorMessage;
  }

  if (
    errorMessage.includes("TIMEOUT") ||
    errorMessage.includes("took too long")
  ) {
    return "La solicitud tardó demasiado en completarse. Por favor, intenta nuevamente.";
  }

  if (
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("Network request failed")
  ) {
    return "Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.";
  }

  if (
    errorMessage.includes("INTERNAL_SERVER_ERROR") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Failed to calculate")
  ) {
    return "Error del servidor. Por favor, intenta nuevamente más tarde o contacta al soporte si el problema persiste.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudieron recuperar los datos. Por favor, intenta nuevamente.";
}

function isRecoverableError(error: unknown): boolean {
  if (!error) return true;

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be logged in") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return false;
  }

  return true;
}

interface PersistentHeaderProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  lastUpdated: string | undefined;
  stats: StatsResponse | undefined;
  isFetching: boolean;
  onRefresh: () => void;
  _userRole: string | undefined;
}

function PersistentHeader({
  dateRange,
  onDateRangeChange,
  lastUpdated,
  stats,
  isFetching,
  onRefresh,
  _userRole,
}: Readonly<PersistentHeaderProps>) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8">
      <div className="bg-card/50 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Vista General</h2>
            {isFetching && (
              <Badge variant="secondary" className="animate-pulse gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Actualizando
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              {lastUpdated ? `Actualizado ${lastUpdated}` : "Actualizado ahora"}
            </div>
            {stats && (
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                {stats.totalMetricsRecords.toLocaleString()} registros
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton dateRange={dateRange} />
            <Button
              onClick={onRefresh}
              disabled={isFetching}
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
              />
              <span className="sr-only">Actualizar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricsDashboard() {
  const { user: authUser } = useAuth();
  const user = authUser as WorkOSUser | null;

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const metricsQuery = api.metrics.get.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled: !!user,
    },
  );

  const { data, error, isError, isPending, isFetching, isRefetching } =
    metricsQuery;
  const refetch = metricsQuery.refetch as () => Promise<unknown>;

  const { data: stats } = api.metrics.getStats.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled: !!user,
    },
  );

  const lastUpdated = useMemo(
    () =>
      data
        ? getDateFormatter().format(new Date(data.metadata.updatedAt))
        : undefined,
    [data],
  );

  return (
    <AppLayout>
      {(view) => (
        <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
          {user && !isPending && (
            <PersistentHeader
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              lastUpdated={lastUpdated}
              stats={stats}
              isFetching={isFetching}
              onRefresh={() => {
                void refetch();
              }}
              _userRole={user.role ?? undefined}
            />
          )}

          {isPending ? (
            <LoadingState />
          ) : !user ? (
            <ErrorState
              title="Authentication Required"
              message="Por favor, inicia sesión para ver las métricas."
              onRetry={() => {
                globalThis.location.reload();
              }}
              isRetrying={false}
              showHomeButton={true}
            />
          ) : isError ? (
            <ErrorState
              title={getErrorTitle(error)}
              message={getErrorMessage(error)}
              onRetry={
                isRecoverableError(error)
                  ? () => {
                      void refetch();
                    }
                  : undefined
              }
              isRetrying={isRefetching}
              showHomeButton={true}
            />
          ) : !data || isEmptyData(data) ? (
            <NoMetricsEmptyState
              onRefresh={() => {
                void refetch();
              }}
              isRefreshing={isRefetching}
            />
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500">
              {view === "overview" && <OverviewHighlights metrics={data} />}
              {view === "usage" && <UsageMetrics metrics={data} />}
              {view === "rag-quality" && <RAGQualityMetrics metrics={data} />}
              {view === "performance" && <PerformanceMetrics metrics={data} />}
              {view === "insights" && <InsightsView metrics={data} />}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function LoadingState() {
  return (
    <div className="animate-in fade-in space-y-6 duration-500 sm:space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
          <Card
            key={`kpi-${id}`}
            className="bg-card/40 overflow-hidden rounded-2xl border-none shadow-sm backdrop-blur-sm"
          >
            <div className="from-muted/20 absolute inset-0 bg-linear-to-br to-transparent" />
            <CardHeader className="relative p-4 pb-2">
              <div className="bg-muted h-8 w-8 animate-pulse rounded-lg" />
              <div className="bg-muted mt-4 h-2 w-16 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-8 w-24 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="relative p-4 pt-0">
              <div className="bg-muted h-2 w-12 animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2, 3].map((id) => (
          <Card
            key={id}
            className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm lg:even:col-span-2"
          >
            <CardHeader className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="bg-muted h-6 w-48 animate-pulse rounded" />
                  <div className="bg-muted h-4 w-64 animate-pulse rounded" />
                </div>
                <div className="bg-muted h-10 w-10 animate-pulse rounded-xl" />
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="bg-muted/50 h-[300px] w-full animate-pulse rounded-xl" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UsageMetrics({ metrics }: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const userActivity = metrics.user_activity;

  const roleDistributionData = useMemo(
    () =>
      Object.entries(userActivity.role_distribution).map(([role, count]) => ({
        role,
        value: count,
        fill: `var(--color-${role.toLowerCase()})`,
      })),
    [userActivity.role_distribution],
  );

  const activityByDayData = useMemo(
    () =>
      userActivity.by_day.map((item) => ({
        ...item,
        date: new Date(item.date).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [userActivity.by_day],
  );

  const hourlyPatternData = useMemo(
    () =>
      userActivity.hourly_pattern.map((item) => ({
        ...item,
        label: `${item.hour.toString().padStart(2, "0")}:00`,
      })),
    [userActivity.hourly_pattern],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          1. Métricas de uso e interacción
        </h2>
        <p className="text-muted-foreground text-sm">
          Datos de la tabla user_activity
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.activityTrend && activityByDayData.length > 0 && (
          <Card className="overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Tendencia de actividad
                </CardTitle>
                <CardDescription>Eventos y usuarios por día</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Activity size={20} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={activityChartConfig}
                className="h-[350px] w-full"
              >
                <AreaChart
                  data={activityByDayData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillEvents" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-event_count)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-event_count)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-unique_users)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-unique_users)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11, fontWeight: 500 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11, fontWeight: 500 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="event_count"
                    stroke="var(--color-event_count)"
                    fill="url(#fillEvents)"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "var(--color-event_count)",
                      strokeWidth: 2,
                      stroke: "white",
                    }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="unique_users"
                    stroke="var(--color-unique_users)"
                    fill="url(#fillUsers)"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "var(--color-unique_users)",
                      strokeWidth: 2,
                      stroke: "white",
                    }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <ChartLegend
                    content={<ChartLegendContent />}
                    className="pt-4"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:col-span-2 lg:grid-cols-2">
          {visibility.departmentPieChart && roleDistributionData.length > 0 && (
            <Card className="overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">
                    Distribución por rol
                  </CardTitle>
                  <CardDescription>Usuarios por rol de acceso</CardDescription>
                </div>
                <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                  <User size={18} />
                </div>
              </CardHeader>
              <CardContent className="overflow-hidden py-4">
                <ChartContainer
                  config={roleChartConfig}
                  className="mx-auto h-[300px] w-full"
                >
                  <PieChart>
                    <Pie
                      data={roleDistributionData}
                      dataKey="value"
                      nameKey="role"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      cornerRadius={6}
                    >
                      {roleDistributionData.map((entry) => (
                        <Cell
                          key={`cell-${entry.role}`}
                          fill={entry.fill}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          nameKey="role"
                          labelKey="role"
                          hideIndicator
                          className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                        />
                      }
                    />
                    <ChartLegend
                      content={<ChartLegendContent nameKey="role" />}
                      className="flex-wrap gap-x-4 gap-y-2 pt-4"
                    />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {visibility.hourlyActivityPattern && hourlyPatternData.length > 0 && (
            <Card className="overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">
                    Patrón horario
                  </CardTitle>
                  <CardDescription>Eventos por hora del día</CardDescription>
                </div>
                <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                  <Clock size={18} />
                </div>
              </CardHeader>
              <CardContent className="overflow-hidden py-4">
                <ChartContainer
                  config={hourlyChartConfig}
                  className="h-[300px] w-full"
                >
                  <BarChart
                    data={hourlyPatternData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="barGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--color-event_count)"
                          stopOpacity={1}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-event_count)"
                          stopOpacity={0.6}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={3}
                      style={{ fontSize: 10, fontWeight: 500 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: 10, fontWeight: 500 }}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                      }
                    />
                    <Bar
                      dataKey="event_count"
                      fill="url(#barGradient)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function RAGQualityMetrics({
  metrics,
}: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const metricsByTag = metrics.metrics.by_tag;

  const metricsChartData = useMemo(
    () =>
      metricsByTag.map((item) => ({
        tag:
          item.tag.length > 20 ? item.tag.substring(0, 20) + "..." : item.tag,
        fullTag: item.tag,
        avg_value: Number(item.avg_value.toFixed(2)),
        count: item.count,
      })),
    [metricsByTag],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          2. Métricas de calidad del RAG
        </h2>
        <p className="text-muted-foreground text-sm">
          Datos de la tabla metrics (tag/value)
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {visibility.metricsByTag && metricsChartData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Métricas por tipo
                </CardTitle>
                <CardDescription>
                  Valor promedio y conteo por etiqueta
                </CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Database size={20} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  avg_value: {
                    label: "Valor promedio",
                    color: "oklch(0.6 0.25 250)",
                  },
                  count: { label: "Conteo", color: "oklch(0.7 0.2 150)" },
                }}
                className="h-[400px] w-full"
              >
                <BarChart
                  data={metricsChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="barAvgGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--color-avg_value)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-avg_value)"
                        stopOpacity={1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="tag"
                    tickLine={false}
                    axisLine={false}
                    width={140}
                    style={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullTag"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <Bar
                    dataKey="avg_value"
                    fill="url(#barAvgGradient)"
                    radius={[0, 6, 6, 0]}
                    barSize={32}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {metricsChartData.length === 0 && (
          <div className="bg-card/20 flex h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center backdrop-blur-sm">
            <div className="bg-muted text-muted-foreground rounded-full p-3">
              <Database size={24} />
            </div>
            <p className="text-muted-foreground text-sm font-medium">
              No hay métricas RAG disponibles en este período
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PerformanceMetrics({
  metrics,
}: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const requestStats = metrics.request_stats;

  const methodChartData = useMemo(
    () =>
      Object.entries(requestStats.method_breakdown).map(([method, count]) => ({
        method,
        value: count,
        fill: `var(--color-${method})`,
      })),
    [requestStats.method_breakdown],
  );

  const statusChartData = useMemo(() => {
    const grouped: Record<string, number> = {};
    Object.entries(requestStats.status_breakdown).forEach(([status, count]) => {
      const statusNum = Number.parseInt(status);
      if (statusNum >= 200 && statusNum < 300) {
        grouped["2xx"] = (grouped["2xx"] ?? 0) + count;
      } else if (statusNum >= 300 && statusNum < 400) {
        grouped["3xx"] = (grouped["3xx"] ?? 0) + count;
      } else if (statusNum >= 400 && statusNum < 500) {
        grouped["4xx"] = (grouped["4xx"] ?? 0) + count;
      } else if (statusNum >= 500) {
        grouped["5xx"] = (grouped["5xx"] ?? 0) + count;
      }
    });
    return Object.entries(grouped).map(([status, count]) => ({
      status,
      value: count,
      fill: `var(--color-${status})`,
    }));
  }, [requestStats.status_breakdown]);

  const endpointChartData = useMemo(
    () =>
      Object.entries(requestStats.endpoint_breakdown)
        .slice(0, 10)
        .map(([endpoint, count]) => ({
          endpoint:
            endpoint.length > 30 ? endpoint.substring(0, 30) + "..." : endpoint,
          fullEndpoint: endpoint,
          count,
        })),
    [requestStats.endpoint_breakdown],
  );

  const requestsByDayData = useMemo(
    () =>
      requestStats.by_day.map((item) => ({
        ...item,
        date: new Date(item.date).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        }),
      })),
    [requestStats.by_day],
  );

  const latencyDistributionData = useMemo(
    () => requestStats.latency_distribution,
    [requestStats.latency_distribution],
  );

  const latencyByEndpointData = useMemo(
    () =>
      requestStats.latency_by_endpoint.map((item) => ({
        ...item,
        endpoint:
          item.endpoint.length > 25
            ? item.endpoint.substring(0, 25) + "..."
            : item.endpoint,
        fullEndpoint: item.endpoint,
        avg_latency: Number(item.avg_latency.toFixed(0)),
      })),
    [requestStats.latency_by_endpoint],
  );

  const errorByEndpointData = useMemo(
    () =>
      requestStats.error_by_endpoint.map((item) => ({
        ...item,
        endpoint:
          item.endpoint.length > 25
            ? item.endpoint.substring(0, 25) + "..."
            : item.endpoint,
        fullEndpoint: item.endpoint,
        error_rate: Number(item.error_rate.toFixed(1)),
      })),
    [requestStats.error_by_endpoint],
  );

  const detailedStatusData = useMemo(
    () =>
      requestStats.detailed_status_codes.map((item) => ({
        status: item.status.toString(),
        count: item.count,
        fill:
          item.status >= 500
            ? "hsl(0 84% 60%)"
            : item.status >= 400
              ? "hsl(43 92% 58%)"
              : item.status >= 300
                ? "hsl(199 89% 62%)"
                : "hsl(142 70% 45%)",
      })),
    [requestStats.detailed_status_codes],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          3. Métricas de rendimiento e infraestructura
        </h2>
        <p className="text-muted-foreground text-sm">
          Datos de la tabla requests
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {visibility.tokenUsageChart && methodChartData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">
                  Por método HTTP
                </CardTitle>
                <CardDescription>Distribución de peticiones</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Zap size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <ChartContainer
                config={methodChartConfig}
                className="mx-auto h-[300px] w-full"
              >
                <PieChart>
                  <Pie
                    data={methodChartData}
                    dataKey="value"
                    nameKey="method"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    cornerRadius={6}
                  >
                    {methodChartData.map((entry) => (
                      <Cell
                        key={`cell-${entry.method}`}
                        fill={entry.fill}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="method"
                        labelKey="method"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <ChartLegend
                    content={<ChartLegendContent nameKey="method" />}
                    className="flex-wrap gap-x-4 gap-y-2 pt-4"
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.resourceConsumption && statusChartData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">Por estado</CardTitle>
                <CardDescription>Códigos de respuesta</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <AlertCircle size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden">
              <ChartContainer
                config={statusChartConfig}
                className="mx-auto h-[300px] w-full"
              >
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    cornerRadius={6}
                  >
                    {statusChartData.map((entry) => (
                      <Cell
                        key={`cell-${entry.status}`}
                        fill={entry.fill}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="status"
                        labelKey="status"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <ChartLegend
                    content={<ChartLegendContent nameKey="status" />}
                    className="flex-wrap gap-x-4 gap-y-2 pt-4"
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.requestsTrend && requestsByDayData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Tendencia de peticiones
                </CardTitle>
                <CardDescription>Peticiones y errores por día</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <TrendingUp size={20} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={requestsChartConfig}
                className="h-[350px] w-full"
              >
                <LineChart
                  data={requestsByDayData}
                  margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11, fontWeight: 500 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11, fontWeight: 500 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="request_count"
                    stroke="var(--color-request_count)"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "var(--color-request_count)",
                      strokeWidth: 2,
                      stroke: "white",
                    }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="error_count"
                    stroke="var(--color-error_count)"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "var(--color-error_count)",
                      strokeWidth: 2,
                      stroke: "white",
                    }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <ChartLegend
                    content={<ChartLegendContent />}
                    className="pt-4"
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.costPerQuery && endpointChartData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Top endpoints
                </CardTitle>
                <CardDescription>Endpoints más utilizados</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <ArrowUpRight size={20} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  count: { label: "Peticiones", color: "oklch(0.6 0.25 250)" },
                }}
                className="h-[350px] w-full"
              >
                <BarChart
                  data={endpointChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="barEndpointGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--color-count)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-count)"
                        stopOpacity={1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    width={180}
                    style={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullEndpoint"
                        nameKey="endpoint"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="url(#barEndpointGradient)"
                    radius={[0, 6, 6, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.latencyDistribution &&
          latencyDistributionData.length > 0 && (
            <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold">
                    Distribución de latencia
                  </CardTitle>
                  <CardDescription>
                    Peticiones por rango de tiempo
                  </CardDescription>
                </div>
                <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                  <Zap size={18} />
                </div>
              </CardHeader>
              <CardContent className="overflow-hidden p-0 pt-4">
                <ChartContainer
                  config={latencyChartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    data={latencyDistributionData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="range"
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: 10 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      style={{ fontSize: 10 }}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                      }
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[6, 6, 0, 0]}
                      barSize={40}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

        {visibility.detailedStatusCodes && detailedStatusData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">
                  Estados detallados
                </CardTitle>
                <CardDescription>Desglose completo de códigos</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <AlertCircle size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  count: { label: "Peticiones", color: "oklch(0.6 0.25 250)" },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={detailedStatusData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="status"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                    {detailedStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.latencyByEndpoint && latencyByEndpointData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">
                  Latencia por endpoint
                </CardTitle>
                <CardDescription>Promedios más altos</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Zap size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  avg_latency: {
                    label: "Latencia (ms)",
                    color: "oklch(0.7 0.2 60)",
                  },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={latencyByEndpointData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    style={{ fontSize: 10, fontWeight: 600 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullEndpoint"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <Bar
                    dataKey="avg_latency"
                    fill="var(--color-avg_latency)"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.errorsByEndpoint && errorByEndpointData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">
                  Errores por endpoint
                </CardTitle>
                <CardDescription>Endpoints con más fallos</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <AlertCircle size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  error_count: {
                    label: "Errores",
                    color: "oklch(0.6 0.25 20)",
                  },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={errorByEndpointData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    style={{ fontSize: 10, fontWeight: 600 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullEndpoint"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <Bar
                    dataKey="error_count"
                    fill="var(--color-error_count)"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InsightsView({ metrics }: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const topWords = metrics.top_words;
  const topTopics = metrics.top_topics;

  const topWordsBarData = useMemo(
    () =>
      topWords.map((item) => ({
        word: item.word,
        count: item.count,
      })),
    [topWords],
  );

  const topicsBarData = useMemo(
    () =>
      topTopics.map((item) => ({
        topic:
          item.topic.length > 20
            ? item.topic.substring(0, 20) + "..."
            : item.topic,
        fullTopic: item.topic,
        count: item.count,
      })),
    [topTopics],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          Extras interesantes
        </h2>
        <p className="text-muted-foreground text-sm">
          Datos de las tablas word_counts y topic_counts
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {visibility.commonWords && (
          <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Palabras más buscadas
                </CardTitle>
                <CardDescription>
                  Frecuencia en la tabla word_counts
                </CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Database size={20} />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {topWords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topWords.map((item) => (
                    <Badge
                      key={item.word}
                      variant="secondary"
                      className="bg-primary/5 text-primary hover:bg-primary/10 rounded-lg px-3 py-1.5 text-xs font-bold transition-all hover:scale-105"
                    >
                      #{item.word}{" "}
                      <span className="ml-1.5 opacity-60">{item.count}</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
                  No hay datos de palabras disponibles
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {visibility.topQueries && (
          <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Temas más frecuentes
                </CardTitle>
                <CardDescription>De la tabla topic_counts</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Sparkles size={20} />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {topTopics.length > 0 ? (
                <div className="grid gap-3">
                  {topTopics.map((item, idx) => (
                    <div
                      key={item.topic}
                      className="group bg-background/40 hover:bg-background/60 flex items-center justify-between rounded-xl border p-4 transition-all hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 text-primary flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold">
                          {idx + 1}
                        </div>
                        <span className="text-sm font-semibold">
                          {item.topic}
                        </span>
                      </div>
                      <Badge variant="outline" className="font-black">
                        {item.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
                  No hay datos de temas disponibles
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {visibility.topWordsBarChart && topWordsBarData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">
                  Gráfico de palabras
                </CardTitle>
                <CardDescription>Top palabras por frecuencia</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <BarChart3 size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  count: { label: "Búsquedas", color: "oklch(0.7 0.2 200)" },
                }}
                className="h-[300px] w-full"
              >
                <BarChart
                  data={topWordsBarData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="word"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[6, 6, 0, 0]}
                    barSize={40}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.topicsBarChart && topicsBarData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg font-bold">
                  Gráfico de temas
                </CardTitle>
                <CardDescription>Top temas por frecuencia</CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <TrendingUp size={18} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  count: { label: "Menciones", color: "oklch(0.7 0.2 330)" },
                }}
                className="h-[300px] w-full"
              >
                <BarChart
                  data={topicsBarData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    style={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="topic"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                    style={{ fontSize: 10, fontWeight: 600 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullTopic"
                        hideIndicator
                        className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 6, 6, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.alerts && (
          <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight">
                  Estado del sistema
                </CardTitle>
                <CardDescription>
                  Resumen de salud y performance
                </CardDescription>
              </div>
              <div
                className={cn(
                  "rounded-xl p-2.5",
                  metrics.error_rate < 5
                    ? "bg-emerald-500/10 text-emerald-500"
                    : metrics.error_rate < 10
                      ? "bg-yellow-500/10 text-yellow-500"
                      : "bg-red-500/10 text-red-500",
                )}
              >
                <Activity size={20} />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div
                className={cn(
                  "rounded-2xl border p-6 transition-all",
                  metrics.error_rate < 5
                    ? "border-emerald-500/20 bg-emerald-500/5 shadow-inner shadow-emerald-500/5"
                    : metrics.error_rate < 10
                      ? "border-yellow-500/20 bg-yellow-500/5 shadow-inner shadow-yellow-500/5"
                      : "border-red-500/20 bg-red-500/5 shadow-inner shadow-red-500/5",
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-2xl",
                      metrics.error_rate < 5
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                        : metrics.error_rate < 10
                          ? "bg-yellow-500 text-white shadow-lg shadow-yellow-500/20"
                          : "bg-red-500 text-white shadow-lg shadow-red-500/20",
                    )}
                  >
                    {metrics.error_rate < 5 ? (
                      <TrendingUp size={24} />
                    ) : (
                      <AlertCircle size={24} />
                    )}
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-lg font-black tracking-tight",
                        metrics.error_rate < 5
                          ? "text-emerald-700 dark:text-emerald-300"
                          : metrics.error_rate < 10
                            ? "text-yellow-700 dark:text-yellow-300"
                            : "text-red-700 dark:text-red-300",
                      )}
                    >
                      {metrics.error_rate < 5
                        ? "SISTEMA SEGURO"
                        : metrics.error_rate < 10
                          ? "ATENCIÓN NECESARIA"
                          : "SISTEMA INSTABLE"}
                    </p>
                    <p className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
                      Tasa de error: {metrics.error_rate.toFixed(2)}% ·
                      Latencia:{" "}
                      {metrics.request_stats.avg_latency?.toFixed(0) ?? "N/A"}{" "}
                      ms
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {visibility.thematicDistribution && (
        <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold tracking-tight">
                Distribución de roles
              </CardTitle>
              <CardDescription>
                Usuarios activos por rol en la organización
              </CardDescription>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <User size={20} />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {Object.keys(metrics.user_activity.role_distribution).length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(metrics.user_activity.role_distribution).map(
                  ([role, count]) => (
                    <div
                      key={role}
                      className="bg-background/40 hover:bg-background/60 flex items-center justify-between rounded-xl border p-4 transition-all hover:shadow-md"
                    >
                      <span className="text-sm font-semibold capitalize">
                        {role}
                      </span>
                      <Badge variant="secondary" className="font-black">
                        {count}
                      </Badge>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <p className="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
                No hay datos de distribución disponibles
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
