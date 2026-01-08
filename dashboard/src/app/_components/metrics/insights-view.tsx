"use client";

import { Badge } from "@/components/ui/badge";
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
import { BarChart3, Database, Sparkles, TrendingUp, User } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type MetricsResponse } from "./types";

interface InsightsViewProps {
  metrics: MetricsResponse;
}

export function InsightsView({ metrics }: Readonly<InsightsViewProps>) {
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
                      className="group border-muted/20 bg-background/40 hover:bg-background/60 flex items-center justify-between rounded-xl border p-4 transition-all hover:shadow-md"
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
                      className="border-muted/20 bg-background/40 hover:bg-background/60 flex items-center justify-between rounded-xl border p-4 transition-all hover:shadow-md"
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
