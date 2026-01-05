"use client";

import { DateRangeSelector } from "@/components/date-range-selector";
import { NoMetricsEmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { api, type RouterOutputs } from "@/trpc/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
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
  event_count: { label: "Eventos", color: "hsl(221 83% 53%)" },
  unique_users: { label: "Usuarios únicos", color: "hsl(142 70% 45%)" },
};

const requestsChartConfig: ChartConfig = {
  request_count: { label: "Peticiones", color: "hsl(221 83% 53%)" },
  error_count: { label: "Errores", color: "hsl(0 84% 60%)" },
};

const latencyChartConfig: ChartConfig = {
  count: { label: "Peticiones", color: "hsl(262 83% 68%)" },
};

const hourlyChartConfig: ChartConfig = {
  event_count: { label: "Actividad", color: "hsl(199 89% 62%)" },
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
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-xs sm:text-sm">
                {lastUpdated
                  ? `Actualizado ${lastUpdated}`
                  : "Actualizado hace momentos"}
              </p>
              {isFetching && (
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Actualizando...</span>
                </div>
              )}
            </div>
            {stats && (
              <p className="text-muted-foreground text-xs">
                {stats.totalMetricsRecords} registro
                {stats.totalMetricsRecords !== 1 ? "s" : ""} de métricas
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton dateRange={dateRange} />
          <Button
            onClick={onRefresh}
            disabled={isFetching}
            size="sm"
            variant="outline"
            className="min-h-[44px] gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {isFetching ? "Actualizando..." : "Actualizar"}
            </span>
            <span className="sm:hidden">{isFetching ? "..." : "↻"}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-muted-foreground text-sm font-medium">
          Rango de fechas:
        </span>
        <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
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
            <>
              <StatsRow metrics={data} />

              {view === "usage" && <UsageMetrics metrics={data} />}
              {view === "rag-quality" && <RAGQualityMetrics metrics={data} />}
              {view === "performance" && <PerformanceMetrics metrics={data} />}
              {view === "insights" && <InsightsView metrics={data} />}
            </>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function StatCard({
  label,
  value,
  helper,
}: Readonly<{ label: string; value: string; helper?: string }>) {
  return (
    <Card className="rounded-xl transition-shadow hover:shadow-sm">
      <CardHeader className="p-3 pb-1">
        <CardDescription className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
          {label}
        </CardDescription>
        <CardTitle className="text-xl font-bold tracking-tight md:text-2xl">
          {value}
        </CardTitle>
      </CardHeader>
      {helper ? (
        <CardContent className="p-3 pt-0">
          <p className="text-muted-foreground text-[10px]">{helper}</p>
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
    <div className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 md:grid-cols-4 lg:grid-cols-8">
      <StatCard
        label="Usuarios únicos"
        value={uniqueUsers}
        helper="En el período"
      />
      <StatCard
        label="Eventos totales"
        value={totalEvents}
        helper="Interacciones"
      />
      <StatCard
        label="Sesión media"
        value={`${avgSession} min`}
        helper="Tiempo de uso"
      />
      <StatCard
        label="Latencia red"
        value={`${avgLatency} ms`}
        helper="Respuesta servidor"
      />
      <StatCard
        label="Peticiones"
        value={totalRequests}
        helper="Total sistema"
      />
      <StatCard
        label="Tasa de error"
        value={`${errorRate}%`}
        helper="Respuestas fallidas"
      />
      <StatCard
        label="Latencia RAG"
        value={`${ragLatency} ms`}
        helper="Respuesta LLM"
      />
      <StatCard
        label="Métricas RAG"
        value={totalMetrics}
        helper="Registros totales"
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
          <Card key={`kpi-${id}`} className="rounded-xl">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="bg-muted h-2 w-16 animate-pulse rounded" />
              <CardTitle className="bg-muted mt-2 h-6 w-20 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="bg-muted h-2 w-12 animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map((id) => (
          <Card key={id} className="overflow-hidden rounded-xl">
            <CardHeader>
              <CardTitle className="bg-muted h-5 w-1/2 animate-pulse rounded" />
              <CardDescription className="bg-muted mt-2 h-4 w-2/3 animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="bg-muted h-80 animate-pulse rounded-xl" />
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
        {visibility.departmentPieChart && roleDistributionData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Distribución por rol</CardTitle>
              <CardDescription>Usuarios por rol de acceso</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={roleChartConfig}
                className="mx-auto h-[320px] w-full max-w-[420px]"
              >
                <PieChart>
                  <Pie
                    data={roleDistributionData}
                    dataKey="value"
                    nameKey="role"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={4}
                    label
                  >
                    {roleDistributionData.map((entry) => (
                      <Cell key={`cell-${entry.role}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="role"
                        labelKey="role"
                        hideIndicator
                      />
                    }
                  />
                  <ChartLegend
                    content={<ChartLegendContent nameKey="role" />}
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.activityTrend && activityByDayData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Tendencia de actividad</CardTitle>
              <CardDescription>Eventos y usuarios por día</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={activityChartConfig}
                className="h-[320px] w-full"
              >
                <AreaChart
                  data={activityByDayData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <defs>
                    <linearGradient id="fillEvents" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-event_count)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-event_count)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                    <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-unique_users)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-unique_users)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="event_count"
                    stroke="var(--color-event_count)"
                    fill="url(#fillEvents)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="unique_users"
                    stroke="var(--color-unique_users)"
                    fill="url(#fillUsers)"
                    strokeWidth={2}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.hourlyActivityPattern && hourlyPatternData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md lg:col-span-2">
            <CardHeader>
              <CardTitle>Patrón de actividad horaria</CardTitle>
              <CardDescription>
                Distribución de eventos por hora del día
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={hourlyChartConfig}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={hourlyPatternData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="event_count"
                    fill="var(--color-event_count)"
                    radius={[4, 4, 0, 0]}
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

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.metricsByTag && metricsChartData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md lg:col-span-2">
            <CardHeader>
              <CardTitle>Métricas por tipo</CardTitle>
              <CardDescription>
                Valor promedio y conteo por etiqueta
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  avg_value: {
                    label: "Valor promedio",
                    color: "hsl(221 83% 53%)",
                  },
                  count: { label: "Conteo", color: "hsl(142 70% 45%)" },
                }}
                className="h-[320px] w-full"
              >
                <BarChart
                  data={metricsChartData}
                  layout="vertical"
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="tag"
                    tickLine={false}
                    axisLine={false}
                    width={150}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent labelKey="fullTag" hideIndicator />
                    }
                  />
                  <Bar
                    dataKey="avg_value"
                    fill="var(--color-avg_value)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {metricsChartData.length === 0 && (
          <div className="text-muted-foreground flex h-[100px] items-center justify-center rounded-xl border border-dashed text-sm lg:col-span-2">
            No hay métricas RAG disponibles en este período
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

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.tokenUsageChart && methodChartData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Distribución por método HTTP</CardTitle>
              <CardDescription>GET, POST, PUT, DELETE, etc.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={methodChartConfig}
                className="mx-auto h-[320px] w-full max-w-[420px]"
              >
                <PieChart>
                  <Pie
                    data={methodChartData}
                    dataKey="value"
                    nameKey="method"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={4}
                    label
                  >
                    {methodChartData.map((entry) => (
                      <Cell key={`cell-${entry.method}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="method"
                        labelKey="method"
                        hideIndicator
                      />
                    }
                  />
                  <ChartLegend
                    content={<ChartLegendContent nameKey="method" />}
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.resourceConsumption && statusChartData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Distribución por código de estado</CardTitle>
              <CardDescription>2xx, 3xx, 4xx, 5xx</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={statusChartConfig}
                className="mx-auto h-[320px] w-full max-w-[420px]"
              >
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={4}
                    label
                  >
                    {statusChartData.map((entry) => (
                      <Cell key={`cell-${entry.status}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="status"
                        labelKey="status"
                        hideIndicator
                      />
                    }
                  />
                  <ChartLegend
                    content={<ChartLegendContent nameKey="status" />}
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.costPerQuery && endpointChartData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md lg:col-span-2">
            <CardHeader>
              <CardTitle>Top endpoints</CardTitle>
              <CardDescription>Endpoints más utilizados</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  count: { label: "Peticiones", color: "hsl(221 83% 53%)" },
                }}
                className="h-[320px] w-full"
              >
                <BarChart
                  data={endpointChartData}
                  layout="vertical"
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    width={200}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullEndpoint"
                        nameKey="endpoint"
                        hideIndicator
                      />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 8, 8, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.requestsTrend && requestsByDayData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md lg:col-span-2">
            <CardHeader>
              <CardTitle>Tendencia de peticiones</CardTitle>
              <CardDescription>Peticiones y errores por día</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={requestsChartConfig}
                className="h-[280px] w-full"
              >
                <LineChart
                  data={requestsByDayData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
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
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.latencyDistribution &&
          latencyDistributionData.length > 0 && (
            <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>Distribución de latencia</CardTitle>
                <CardDescription>
                  Peticiones por rango de tiempo
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-hidden px-0">
                <ChartContainer
                  config={latencyChartConfig}
                  className="h-[280px] w-full"
                >
                  <BarChart
                    data={latencyDistributionData}
                    margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="range" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="count"
                      fill="var(--color-count)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

        {visibility.detailedStatusCodes && detailedStatusData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Códigos de estado detallados</CardTitle>
              <CardDescription>
                Desglose completo de códigos HTTP
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  count: { label: "Peticiones", color: "hsl(221 83% 53%)" },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={detailedStatusData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
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
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Latencia por endpoint</CardTitle>
              <CardDescription>
                Endpoints con mayor latencia promedio
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  avg_latency: {
                    label: "Latencia (ms)",
                    color: "hsl(43 92% 58%)",
                  },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={latencyByEndpointData}
                  layout="vertical"
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    width={180}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullEndpoint"
                        hideIndicator
                      />
                    }
                  />
                  <Bar
                    dataKey="avg_latency"
                    fill="var(--color-avg_latency)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.errorsByEndpoint && errorByEndpointData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Errores por endpoint</CardTitle>
              <CardDescription>Endpoints con más errores</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  error_count: {
                    label: "Errores",
                    color: "hsl(0 84% 60%)",
                  },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={errorByEndpointData}
                  layout="vertical"
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tickLine={false}
                    axisLine={false}
                    width={180}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="fullEndpoint"
                        hideIndicator
                      />
                    }
                  />
                  <Bar
                    dataKey="error_count"
                    fill="var(--color-error_count)"
                    radius={[0, 4, 4, 0]}
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

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.commonWords && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Palabras más buscadas</CardTitle>
              <CardDescription>De la tabla word_counts</CardDescription>
            </CardHeader>
            <CardContent>
              {topWords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topWords.map((item) => (
                    <span
                      key={item.word}
                      className="text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium"
                    >
                      #{item.word} ({item.count})
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No hay datos de palabras disponibles
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {visibility.topQueries && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Temas más frecuentes</CardTitle>
              <CardDescription>De la tabla topic_counts</CardDescription>
            </CardHeader>
            <CardContent>
              {topTopics.length > 0 ? (
                <ul className="text-muted-foreground grid gap-2 text-sm">
                  {topTopics.map((item) => (
                    <li
                      key={item.topic}
                      className="bg-card/40 flex justify-between rounded-md border p-3"
                    >
                      <span>{item.topic}</span>
                      <span className="font-medium">{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No hay datos de temas disponibles
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {visibility.topWordsBarChart && topWordsBarData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Gráfico de palabras buscadas</CardTitle>
              <CardDescription>Top palabras por frecuencia</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  count: { label: "Búsquedas", color: "hsl(199 89% 62%)" },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={topWordsBarData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="word" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.topicsBarChart && topicsBarData.length > 0 && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Gráfico de temas</CardTitle>
              <CardDescription>Top temas por frecuencia</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={{
                  count: { label: "Menciones", color: "hsl(330 72% 65%)" },
                }}
                className="h-[280px] w-full"
              >
                <BarChart
                  data={topicsBarData}
                  layout="vertical"
                  margin={{ top: 16, right: 16, left: 16, bottom: 16 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="topic"
                    tickLine={false}
                    axisLine={false}
                    width={150}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent labelKey="fullTopic" hideIndicator />
                    }
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.alerts && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Estado del sistema</CardTitle>
              <CardDescription>Resumen de métricas clave</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`rounded-lg border p-4 text-sm ${
                  metrics.error_rate < 5
                    ? "border-emerald-300/60 bg-emerald-100/70 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    : metrics.error_rate < 10
                      ? "border-yellow-300/60 bg-yellow-100/70 dark:border-yellow-500/40 dark:bg-yellow-500/10"
                      : "border-red-300/60 bg-red-100/70 dark:border-red-500/40 dark:bg-red-500/10"
                }`}
              >
                <p
                  className={`font-medium ${
                    metrics.error_rate < 5
                      ? "text-emerald-900 dark:text-emerald-100"
                      : metrics.error_rate < 10
                        ? "text-yellow-900 dark:text-yellow-100"
                        : "text-red-900 dark:text-red-100"
                  }`}
                >
                  {metrics.error_rate < 5
                    ? "Sistema saludable"
                    : metrics.error_rate < 10
                      ? "Atención requerida"
                      : "Sistema con problemas"}
                </p>
                <p className="text-muted-foreground mt-1">
                  Tasa de error: {metrics.error_rate.toFixed(2)}% · Latencia
                  promedio:{" "}
                  {metrics.request_stats.avg_latency?.toFixed(0) ?? "N/A"} ms
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.thematicDistribution && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Distribución de roles</CardTitle>
              <CardDescription>Usuarios activos por rol</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(metrics.user_activity.role_distribution).length >
              0 ? (
                <ul className="text-muted-foreground grid gap-2 text-sm">
                  {Object.entries(metrics.user_activity.role_distribution).map(
                    ([role, count]) => (
                      <li
                        key={role}
                        className="bg-card/40 flex justify-between rounded-md border p-3"
                      >
                        <span className="capitalize">{role}</span>
                        <span className="font-medium">{count}</span>
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No hay datos de distribución disponibles
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
