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
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { Database } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type MetricsResponse } from "./types";

interface RAGQualityMetricsProps {
  metrics: MetricsResponse;
}

export function RAGQualityMetrics({
  metrics,
}: Readonly<RAGQualityMetricsProps>) {
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
