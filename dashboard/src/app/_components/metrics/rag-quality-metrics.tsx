"use client";

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
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { Activity, Cpu, FileText, Zap } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { ChartHint } from "./chart-hint";
import { type MetricsResponse } from "./types";

interface RAGQualityMetricsProps {
  metrics: MetricsResponse;
}

/**
 * Display RAG quality metrics including response time trends, token usage, and system health.
 */
export function RAGQualityMetrics({
  metrics,
}: Readonly<RAGQualityMetricsProps>) {
  const { visibility } = useChartVisibility();
  const ragQuality = metrics.rag_quality;

  const responseTimeData = useMemo(
    () =>
      ragQuality.response_time_trend.map((item) => ({
        ...item,
        date: new Date(item.date).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        }),
        // Convert from seconds to milliseconds for display
        llm_ms: item.llm_response_time * 1000,
        doc_ms: item.doc_response_time * 1000,
      })),
    [ragQuality.response_time_trend],
  );

  const tokenData = useMemo(
    () => [
      {
        name: "LLM",
        input: ragQuality.token_usage.llm_tokens_in,
        output: ragQuality.token_usage.llm_tokens_out,
      },
      {
        name: "RAG",
        input: ragQuality.token_usage.rag_tokens_in,
        output: ragQuality.token_usage.rag_tokens_out,
      },
    ],
    [ragQuality.token_usage],
  );

  const totalTokens =
    ragQuality.token_usage.llm_tokens_in +
    ragQuality.token_usage.llm_tokens_out +
    ragQuality.token_usage.rag_tokens_in +
    ragQuality.token_usage.rag_tokens_out;

  const systemHealth = ragQuality.system_health;
  const hasSystemData =
    systemHealth.avg_cpu > 0 ||
    systemHealth.avg_ram > 0 ||
    systemHealth.avg_gpu > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">
          Calidad y rendimiento del RAG
        </h2>
        <p className="text-muted-foreground text-sm">
          Tiempos de respuesta, consumo de tokens y salud del sistema
        </p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Response Time Trend Chart */}
        {visibility.metricsByTag && responseTimeData.length > 0 && (
          <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-xl font-bold tracking-tight">
                  Tendencia de tiempos de respuesta
                  <ChartHint hint="Muestra cómo evolucionan los tiempos de respuesta del LLM (modelo de lenguaje) y del RAG (recuperación de documentos) a lo largo del tiempo. Valores altos pueden indicar problemas de rendimiento." />
                </CardTitle>
                <CardDescription>
                  Latencia LLM y RAG por día (ms)
                </CardDescription>
              </div>
              <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                <Zap size={20} />
              </div>
            </CardHeader>
            <CardContent className="overflow-hidden p-0 pt-4">
              <ChartContainer
                config={{
                  llm_ms: {
                    label: "LLM (ms)",
                    color: "oklch(0.6 0.25 250)",
                  },
                  doc_ms: {
                    label: "RAG (ms)",
                    color: "oklch(0.7 0.2 150)",
                  },
                }}
                className="h-[300px] w-full"
              >
                <AreaChart
                  data={responseTimeData}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillLLM" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-llm_ms)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-llm_ms)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient id="fillDoc" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-doc_ms)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-doc_ms)"
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
                    style={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={12}
                    style={{ fontSize: 11 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="llm_ms"
                    stroke="var(--color-llm_ms)"
                    fill="url(#fillLLM)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="doc_ms"
                    stroke="var(--color-doc_ms)"
                    fill="url(#fillDoc)"
                    strokeWidth={2}
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

        {/* Token Usage Chart */}
        <Card className="bg-card/40 overflow-hidden rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center text-lg font-bold">
                Consumo de tokens
                <ChartHint hint="Compara los tokens de entrada (lo que envía el usuario + contexto) vs salida (respuesta generada) para LLM y RAG. Más tokens = mayor coste y tiempo de procesamiento." />
              </CardTitle>
              <CardDescription>
                Total: {totalTokens.toLocaleString("es-ES")} tokens
              </CardDescription>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <Activity size={18} />
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden p-0 pt-4">
            <ChartContainer
              config={{
                input: { label: "Entrada", color: "oklch(0.6 0.2 220)" },
                output: { label: "Salida", color: "oklch(0.7 0.25 280)" },
              }}
              className="h-[250px] w-full"
            >
              <BarChart
                data={tokenData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  style={{ fontSize: 11 }}
                  tickFormatter={(value) =>
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md" />
                  }
                />
                <Bar
                  dataKey="input"
                  fill="var(--color-input)"
                  radius={[6, 6, 0, 0]}
                  barSize={50}
                />
                <Bar
                  dataKey="output"
                  fill="var(--color-output)"
                  radius={[6, 6, 0, 0]}
                  barSize={50}
                />
                <ChartLegend
                  content={<ChartLegendContent />}
                  className="pt-4"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* System Health + RAG Stats */}
        <Card className="bg-card/40 rounded-2xl border-none backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center text-lg font-bold">
                Salud del sistema
                <ChartHint hint="Monitoriza el uso de recursos del servidor. Un uso alto sostenido de CPU, RAM o GPU puede indicar la necesidad de escalar la infraestructura." />
              </CardTitle>
              <CardDescription>Uso promedio de recursos</CardDescription>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <Cpu size={18} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            {hasSystemData ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">CPU</span>
                    <span className="text-muted-foreground">
                      {systemHealth.avg_cpu.toFixed(1)}% (máx:{" "}
                      {systemHealth.max_cpu.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={systemHealth.avg_cpu} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">RAM</span>
                    <span className="text-muted-foreground">
                      {systemHealth.avg_ram.toFixed(1)}% (máx:{" "}
                      {systemHealth.max_ram.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={systemHealth.avg_ram} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">GPU</span>
                    <span className="text-muted-foreground">
                      {systemHealth.avg_gpu.toFixed(1)}% (máx:{" "}
                      {systemHealth.max_gpu.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={systemHealth.avg_gpu} className="h-2" />
                </div>
              </>
            ) : (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No hay datos de uso de recursos
              </p>
            )}

            {/* Average docs per query */}
            <div className="border-border mt-4 border-t pt-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary rounded-lg p-2">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium">Docs por consulta</p>
                  <p className="text-muted-foreground text-xs">
                    Promedio de documentos recuperados
                  </p>
                </div>
                <div className="ml-auto text-2xl font-bold">
                  {ragQuality.avg_docs_per_query.toFixed(1)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
