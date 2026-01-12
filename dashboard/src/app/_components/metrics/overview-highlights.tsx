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
import { Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartHint } from "./chart-hint";
import { StatsRow } from "./stats-row";
import { type MetricsResponse } from "./types";

interface OverviewHighlightsProps {
  metrics: MetricsResponse;
}

/**
 * Renders a dashboard overview section with key performance highlights and a recent activity chart.
 */
export function OverviewHighlights({
  metrics,
}: Readonly<OverviewHighlightsProps>) {
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

      <div className="grid grid-cols-1 gap-6">
        <Card className="bg-card/40 rounded-2xl border-none shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center text-lg font-bold">
                Actividad Reciente
                <ChartHint hint="Muestra el número de consultas realizadas al asistente cada día. Cada vez que un usuario envía un mensaje, se registra un evento. Útil para identificar tendencias de uso." />
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
      </div>
    </div>
  );
}
