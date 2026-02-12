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
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartHint } from "./chart-hint";
import { createOverviewActivityChartConfig } from "./constants";
import { StatsRow } from "./stats-row";
import { type MetricsResponse } from "./types";
import { formatShortDate } from "./utils";

interface OverviewHighlightsProps {
  metrics: MetricsResponse;
}

/**
 * Renders a dashboard overview section with key performance highlights and a recent activity chart.
 */
export function OverviewHighlights({
  metrics,
}: Readonly<OverviewHighlightsProps>) {
  const locale = useLocale();
  const t = useTranslations("OverviewHighlights");

  const recentActivityData = useMemo(
    () =>
      metrics.user_activity.by_day.slice(-7).map((item) => ({
        ...item,
        date: formatShortDate(item.date, locale),
      })),
    [locale, metrics.user_activity.by_day],
  );
  const overviewActivityChartConfig = useMemo(
    () =>
      createOverviewActivityChartConfig({ events: t("chartLabels.events") }),
    [t],
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <StatsRow metrics={metrics} />

      <div className="grid grid-cols-1 gap-6">
        <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 rounded-2xl border shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="flex items-center text-lg font-bold">
                {t("recentActivity")}
                <ChartHint hint={t("recentActivityHint")} />
              </CardTitle>
              <CardDescription>
                {t("recentActivityDescription")}
              </CardDescription>
            </div>
            <div className="bg-primary/10 text-primary rounded-xl p-2.5">
              <Activity size={18} />
            </div>
          </CardHeader>
          <CardContent className="h-[300px] p-0 pt-4">
            <ChartContainer
              config={overviewActivityChartConfig}
              className="h-full w-full"
            >
              <AreaChart
                data={recentActivityData}
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
