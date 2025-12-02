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
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "./app-layout";

const usageChartConfig: ChartConfig = {
  users: {
    label: "Unique Users",
    color: "hsl(221 83% 53%)",
  },
  sessions: {
    label: "Active Sessions",
    color: "hsl(142 70% 45%)",
  },
};

const tokenChartConfig: ChartConfig = {
  value: {
    label: "Average Tokens",
    color: "hsl(268 83% 66%)",
  },
};

const departmentChartConfig: ChartConfig = {
  hr: { label: "HR", color: "hsl(11 84% 60%)" },
  it: { label: "IT", color: "hsl(199 89% 62%)" },
  legal: { label: "Legal", color: "hsl(330 72% 65%)" },
  finance: { label: "Finance", color: "hsl(43 92% 58%)" },
  other: { label: "Other", color: "hsl(215 20% 65%)" },
};

const errorChartConfig: ChartConfig = {
  timeout: { label: "Timeout", color: "hsl(0 84% 60%)" },
  retrieval_failure: {
    label: "Retrieval Failure",
    color: "hsl(27 96% 61%)",
  },
  model_call_failure: {
    label: "Model Call Failure",
    color: "hsl(262 83% 68%)",
  },
  other: { label: "Other", color: "hsl(215 20% 65%)" },
  total: { label: "Errors" },
};

// Move formatters inside components to avoid SSR/client mismatch
const getDateFormatter = () =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const getCurrencyFormatter = () =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 3,
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

/**
 * Helper function to detect if the metrics response contains no data
 * Checks if all key usage metrics are zero
 */
function isEmptyData(data: MetricsResponse): boolean {
  return (
    data?.usage_metrics?.processed_queries.total === 0 &&
    data?.usage_metrics?.active_sessions.daily === 0 &&
    data?.usage_metrics?.unique_users.daily === 0
  );
}

/**
 * Helper function to get error title based on error type
 * Classifies errors into UNAUTHORIZED, FORBIDDEN, and general errors
 */
function getErrorTitle(error: unknown): string {
  if (!error) return "Error Loading Metrics";

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  // Check for tRPC error codes in the error message or data
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

/**
 * Helper function to get user-friendly error message based on error type
 */
function getErrorMessage(error: unknown): string {
  if (!error)
    return "No se pudieron recuperar los datos. Por favor, intenta nuevamente.";

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  // UNAUTHORIZED errors
  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("You must be logged in")
  ) {
    return "No tienes autorización para acceder a estos datos. Por favor, inicia sesión nuevamente.";
  }

  // FORBIDDEN errors
  if (
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return "No tienes permisos para acceder a este recurso. Contacta a tu administrador si crees que esto es un error.";
  }

  // NOT_FOUND errors - these are typically empty data scenarios
  // but if they reach here, they're actual errors
  if (errorMessage.includes("NOT_FOUND")) {
    return errorMessage;
  }

  // TIMEOUT errors
  if (
    errorMessage.includes("TIMEOUT") ||
    errorMessage.includes("took too long")
  ) {
    return "La solicitud tardó demasiado en completarse. Por favor, intenta nuevamente.";
  }

  // Network errors
  if (
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("Network request failed")
  ) {
    return "Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.";
  }

  // Server errors
  if (
    errorMessage.includes("INTERNAL_SERVER_ERROR") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("Failed to calculate")
  ) {
    return "Error del servidor. Por favor, intenta nuevamente más tarde o contacta al soporte si el problema persiste.";
  }

  // Return the original error message if it's user-friendly
  // Otherwise, return a generic message
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudieron recuperar los datos. Por favor, intenta nuevamente.";
}

/**
 * Helper function to determine if an error is recoverable (can retry)
 * UNAUTHORIZED and FORBIDDEN errors should not show retry button
 */
function isRecoverableError(error: unknown): boolean {
  if (!error) return true;

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";

  // Non-recoverable errors: auth and permission errors
  if (
    errorMessage.includes("UNAUTHORIZED") ||
    errorMessage.includes("FORBIDDEN") ||
    errorMessage.includes("You must be logged in") ||
    errorMessage.includes("You must be an administrator") ||
    errorMessage.includes("You do not have permission")
  ) {
    return false;
  }

  // All other errors are considered recoverable
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

/**
 * PersistentHeader component that displays date controls, metadata, and action buttons
 * This component remains visible across all states (loading, empty, error, data)
 * Requirement 3.4: Removed nodeId parameter handling
 */
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
              {/* Subtle loading indicator during background refresh */}
              {isFetching && (
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Actualizando...</span>
                </div>
              )}
            </div>
            {/* Display current context info - removed node-specific messaging per Requirement 3.4 */}
            {stats && (
              <p className="text-muted-foreground text-xs">
                {stats.documentCount} registro
                {stats.documentCount !== 1 ? "s" : ""} de métricas
              </p>
            )}
          </div>
        </div>
        {/* Action buttons: Export and Refresh */}
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

      {/* Date Range Selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-muted-foreground text-sm font-medium">
          Rango de fechas:
        </span>
        <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
      </div>
    </div>
  );
}

function humanizeKey(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

export function MetricsDashboard() {
  const { user: authUser } = useAuth();
  const user = authUser as WorkOSUser | null;

  // Set default date range - undefined means fetch all data without date filtering
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Requirement 3.4: Removed nodeId parameter handling - single-node architecture
  const metricsQuery = api.metrics.get.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      refetchInterval: 60_000,
      staleTime: 30_000,
      // Only enable query when we have a user
      enabled: !!user,
    },
  );

  const { data, error, isError, isPending, isFetching, isRefetching } =
    metricsQuery;
  const refetch = metricsQuery.refetch as () => Promise<unknown>;

  // Requirement 3.4: Removed nodeId parameter - single-node architecture
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
          {/* Persistent Header - Always Visible when authenticated and not in initial loading */}
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

          {/* Content Area - Conditional Rendering */}
          {isPending ? (
            <LoadingState />
          ) : !user ? (
            // Handle unauthenticated state
            <ErrorState
              title="Authentication Required"
              message="Por favor, inicia sesión para ver las métricas."
              onRetry={() => {
                window.location.reload();
              }}
              isRetrying={false}
              showHomeButton={true}
            />
          ) : isError ? (
            // Handle actual errors (network, auth, server errors)
            // Error classification: UNAUTHORIZED, FORBIDDEN, and other server errors
            // should display ErrorState without date controls
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
            // Handle empty data state - no metrics in selected date range
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
    <Card className="rounded-xl transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-3xl md:text-4xl">{value}</CardTitle>
      </CardHeader>
      {helper ? (
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">{helper}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function StatsRow({ metrics }: Readonly<{ metrics: MetricsResponse }>) {
  const usage = metrics.usage_metrics;
  const performance = metrics.performance_metrics;
  const dailySessions = usage.active_sessions.daily;
  const avgSession = usage.session_duration.average_minutes.toFixed(1);
  const avgLatency = performance.average_response_time_ms.toFixed(0);
  const totalQueries = usage.processed_queries.total.toLocaleString("es-ES");

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:mb-8 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
      <StatCard
        label="Sesiones activas hoy"
        value={dailySessions.toString()}
        helper="Tiempo real"
      />
      <StatCard
        label="Duración media de sesión"
        value={`${avgSession} min`}
        helper="Promedio agregado"
      />
      <StatCard
        label="Tiempo medio de respuesta"
        value={`${avgLatency} ms`}
        helper="End-to-end"
      />
      <StatCard
        label="Consultas totales"
        value={totalQueries}
        helper="Desde el inicio"
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Stats row skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
        {[1, 2, 3, 4].map((id) => (
          <Card key={`kpi-${id}`} className="rounded-xl">
            <CardHeader className="pb-2">
              <CardDescription className="bg-muted h-3 w-24 animate-pulse rounded" />
              <CardTitle className="bg-muted mt-2 h-8 w-32 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-muted h-3 w-20 animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts skeleton */}
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

// 1. Métricas de uso e interacción
function UsageMetrics({ metrics }: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const usage = metrics.usage_metrics;

  const usageChartData = useMemo(
    () => [
      {
        period: "Diario",
        users: usage.unique_users.daily,
        sessions: usage.active_sessions.daily,
      },
      {
        period: "Semanal",
        users: usage.unique_users.weekly,
        sessions: usage.active_sessions.weekly,
      },
      {
        period: "Mensual",
        users: usage.unique_users.monthly,
        sessions: usage.active_sessions.monthly,
      },
    ],
    [usage],
  );

  const departmentData = useMemo(
    () =>
      Object.entries(usage.department_distribution).map(([key, value]) => ({
        department: key,
        value,
        fill: `var(--color-${key})`,
      })),
    [usage.department_distribution],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          1. Métricas de uso e interacción
        </h2>
        <p className="text-muted-foreground text-sm">
          Seguimiento de usuarios activos y sesiones en tiempo real
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.usageBarChart ? (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Número de usuarios únicos activos</CardTitle>
              <CardDescription>Por día/semana/mes · AGREGADA</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={usageChartConfig}
                className="h-[320px] w-full"
              >
                <BarChart
                  data={usageChartData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 8 }}
                  barSize={36}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend
                    verticalAlign="top"
                    content={<ChartLegendContent />}
                  />
                  <Bar
                    dataKey="users"
                    fill="var(--color-users)"
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    dataKey="sessions"
                    fill="var(--color-sessions)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        ) : null}

        {visibility.activeSessions ? (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Número de sesiones activas</CardTitle>
              <CardDescription>REAL-TIME</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center" aria-live="polite">
                  <p className="text-primary text-6xl font-bold">
                    {usage.active_sessions.daily}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Sesiones activas hoy
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {visibility.sessionDuration ? (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Duración media de sesión</CardTitle>
              <CardDescription>AGREGADA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {usage.session_duration.average_minutes.toFixed(1)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Minutos promedio
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {visibility.departmentPieChart ? (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Distribución por departamentos/roles</CardTitle>
              <CardDescription>Uso por área organizacional</CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={departmentChartConfig}
                className="mx-auto h-[320px] w-full max-w-[420px]"
              >
                <PieChart>
                  <Pie
                    data={departmentData}
                    dataKey="value"
                    nameKey="department"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={4}
                    label
                  >
                    {departmentData.map((entry) => (
                      <Cell
                        key={`cell-${entry.department}`}
                        fill={entry.fill}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="name"
                        labelKey="key"
                        hideIndicator
                      />
                    }
                  />
                  <ChartLegend
                    content={<ChartLegendContent nameKey="department" />}
                    verticalAlign="bottom"
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        ) : null}

        {visibility.requestsPerUser ? (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Número de peticiones por usuario</CardTitle>
              <CardDescription>
                {usage.processed_queries.total.toLocaleString("es-ES")}{" "}
                consultas totales · AGREGADA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {usage.unique_users.monthly > 0
                      ? (
                          usage.processed_queries.total /
                          usage.unique_users.monthly
                        ).toFixed(1)
                      : "0.0"}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Consultas por usuario
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {visibility.responseTime ? (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Tiempo de respuesta total</CardTitle>
              <CardDescription>AGREGADA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {metrics.performance_metrics.average_response_time_ms.toFixed(
                      0,
                    )}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Milisegundos promedio
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// 2. Métricas de calidad del RAG
function RAGQualityMetrics({
  metrics,
}: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const rag = metrics.rag_quality_metrics;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          2. Métricas de calidad del RAG
        </h2>
        <p className="text-muted-foreground text-sm">
          Indicadores de rendimiento del sistema de recuperación
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.retrievalRate && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Tasa de recuperación con éxito</CardTitle>
              <CardDescription>
                % de veces que el sistema devuelve documentos relevantes en el
                top-k
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {rag.successful_retrieval_rate.toFixed(1)}%
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Tasa de éxito
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.retrievalLatency && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Latency de recuperación</CardTitle>
              <CardDescription>Tiempo en recuperar documentos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {rag.retrieval_latency_ms.toFixed(0)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Milisegundos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.modelLatency && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Latencia del modelo</CardTitle>
              <CardDescription>Tiempo de respuesta del LLM</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {metrics.performance_metrics.average_response_time_ms.toFixed(
                      0,
                    )}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Milisegundos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.tokenUsage && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Número de tokens de entrada y salida</CardTitle>
              <CardDescription>Promedio por consulta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="grid grid-cols-2 gap-8 text-center">
                  <div>
                    <p className="text-primary text-4xl font-bold">
                      {metrics.performance_metrics.token_usage.average_prompt.toFixed(
                        0,
                      )}
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Entrada
                    </p>
                  </div>
                  <div>
                    <p className="text-primary text-4xl font-bold">
                      {metrics.performance_metrics.token_usage.average_completion.toFixed(
                        0,
                      )}
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">Salida</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.documentsRetrieved && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                Número de documentos recuperados por consulta
              </CardTitle>
              <CardDescription>
                Antes y después del filtrado, RAG devuelve documentos agente
                decide los que son relevantes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {rag.average_context_tokens.toFixed(0)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Tokens de contexto promedio
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// 3. Métricas de rendimiento e infraestructura
function PerformanceMetrics({
  metrics,
}: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const performance = metrics.performance_metrics;

  const tokenUsageData = useMemo(
    () => [
      {
        type: "Prompt",
        value: performance.token_usage.average_prompt,
      },
      {
        type: "Completion",
        value: performance.token_usage.average_completion,
      },
      {
        type: "Total",
        value: performance.token_usage.average_total,
      },
    ],
    [performance.token_usage],
  );

  const errorChartData = useMemo(
    () =>
      Object.entries(performance.errors).map(([key, total]) => ({
        key,
        label: humanizeKey(key),
        total,
      })),
    [performance.errors],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          3. Métricas de rendimiento e infraestructura
        </h2>
        <p className="text-muted-foreground text-sm">
          Monitoreo de recursos y costos del sistema
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.responseTimeChart && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Tiempo medio de respuesta del chatbot</CardTitle>
              <CardDescription>Latencia end-to-end</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {performance.average_response_time_ms.toFixed(0)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Milisegundos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.tokenUsageChart && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Uso de tokens</CardTitle>
              <CardDescription>
                Prompt, completion, total — para costes en LLM
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={tokenChartConfig}
                className="h-[320px] w-full"
              >
                <AreaChart
                  data={tokenUsageData}
                  margin={{ top: 16, right: 16, left: 16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="type" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-value)"
                    fill="var(--color-value)"
                    fillOpacity={0.2}
                    strokeWidth={3}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {visibility.resourceConsumption && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Consumo de CPU/GPU y memoria</CardTitle>
              <CardDescription>En el servidor central</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="grid grid-cols-2 gap-8 text-center">
                  <div>
                    <p className="text-primary text-4xl font-bold">
                      {performance.resource_consumption.cpu_percent.toFixed(1)}%
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">CPU</p>
                  </div>
                  <div>
                    <p className="text-primary text-4xl font-bold">
                      {performance.resource_consumption.memory_mb.toFixed(0)} MB
                    </p>
                    <p className="text-muted-foreground mt-2 text-sm">
                      Memoria
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.costPerQuery && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Coste estimado por consulta</CardTitle>
              <CardDescription>Si se usa un proveedor externo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[320px] items-center justify-center">
                <div className="text-center">
                  <p className="text-primary text-6xl font-bold">
                    {getCurrencyFormatter().format(performance.cost_per_query)}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Por consulta
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.errorsChart && (
          <Card className="overflow-hidden rounded-xl transition-shadow hover:shadow-md lg:col-span-2">
            <CardHeader>
              <CardTitle>Errores por tipo</CardTitle>
              <CardDescription>
                Timeout, fallo de recuperación, fallo en llamada al modelo, etc.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-hidden px-0">
              <ChartContainer
                config={errorChartConfig}
                className="h-[320px] w-full"
              >
                <BarChart
                  data={errorChartData}
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
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={180}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="key"
                        nameKey="label"
                        hideIndicator
                      />
                    }
                  />
                  <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                    {errorChartData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={`var(--color-${entry.key})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Extras interesantes
function InsightsView({ metrics }: Readonly<{ metrics: MetricsResponse }>) {
  const { visibility } = useChartVisibility();
  const analytics = metrics.extra_analytics;
  const alerts = metrics.alerts;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          Extras interesantes
        </h2>
        <p className="text-muted-foreground text-sm">
          Análisis adicionales y alertas del sistema
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.topQueries && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Top queries</CardTitle>
              <CardDescription>
                Preguntas más frecuentes, útil para mejorar la base de
                conocimiento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground grid gap-2 text-sm">
                {analytics.top_queries.map((query) => (
                  <li key={query} className="bg-card/40 rounded-md border p-3">
                    {query}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {visibility.commonWords && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Palabras más comunes</CardTitle>
              <CardDescription>
                Términos frecuentes en las consultas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {analytics.common_words.map((word) => (
                  <span
                    key={word}
                    className="text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium"
                  >
                    #{word}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.thematicDistribution && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Distribución temática de las consultas</CardTitle>
              <CardDescription>RRHH, IT, legal, etc.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-muted-foreground text-sm">
                  Ver distribución por departamentos en la sección de Uso
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {visibility.alerts && (
          <Card className="rounded-xl transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Alertas automáticas</CardTitle>
              <CardDescription>
                En caso de degradación (ej. latencia &gt; X segundos, error rate
                &gt; Y%)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-100/70 p-4 text-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">
                  {humanizeKey(alerts.status)}
                </p>
                <p className="text-muted-foreground mt-1">
                  Latencia objetivo:{" "}
                  {alerts.latency_alert.toLocaleString("es-ES")} ms · Umbral de
                  error: {alerts.error_rate_alert}%
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
