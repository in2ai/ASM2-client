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
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { Activity, Clock, User } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
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
import { ChartHint } from "./chart-hint";
import {
  createActivityChartConfig,
  createHourlyChartConfig,
  createRoleDistributionChartModel,
} from "./constants";
import { type MetricsResponse } from "./types";
import { formatShortDate } from "./utils";

interface UsageMetricsProps {
  metrics: MetricsResponse;
}

/**
 * Render usage and interaction metrics as a set of responsive cards and charts.
 *
 * Renders an activity trend area chart, a role distribution pie chart, and an hourly activity bar chart when corresponding visibility flags are enabled and data is present. Data transformation for chart inputs is memoized.
 *
 * @param metrics - MetricsResponse containing `user_activity` (including `role_distribution`, `by_day`, and `hourly_pattern`) used to build the charts
 * @returns A React element containing the metrics section with cards and charts, conditionally rendered based on chart visibility and available data
 */
export function UsageMetrics({ metrics }: Readonly<UsageMetricsProps>) {
  const locale = useLocale();
  const t = useTranslations("UsageMetrics");

  const {
    state: { visibility },
  } = useChartVisibility();
  const userActivity = metrics.user_activity;

  const { config: roleChartConfig, data: roleDistributionData } = useMemo(
    () => createRoleDistributionChartModel(userActivity.role_distribution),
    [userActivity.role_distribution],
  );
  const activityChartConfig = useMemo(
    () =>
      createActivityChartConfig({
        events: t("chartLabels.events"),
        uniqueUsers: t("chartLabels.uniqueUsers"),
      }),
    [t],
  );
  const hourlyChartConfig = useMemo(
    () =>
      createHourlyChartConfig({
        activity: t("chartLabels.activity"),
      }),
    [t],
  );

  const activityByDayData = useMemo(
    () =>
      userActivity.by_day.map((item) => ({
        ...item,
        date: formatShortDate(item.date, locale),
      })),
    [locale, userActivity.by_day],
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
        <h2 className="text-xl font-semibold sm:text-2xl">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        <div className="bg-border mt-3 h-px" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {visibility.activityTrend && activityByDayData.length > 0 && (
          <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center text-xl font-bold tracking-tight">
                  {t("activityTrend.title")}
                  <ChartHint hint={t("activityTrend.hint")} />
                </CardTitle>
                <CardDescription>
                  {t("activityTrend.description")}
                </CardDescription>
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
            <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="flex items-center text-lg font-bold">
                    {t("roleDistribution.title")}
                    <ChartHint hint={t("roleDistribution.hint")} />
                  </CardTitle>
                  <CardDescription>
                    {t("roleDistribution.description")}
                  </CardDescription>
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
                      nameKey="roleKey"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      cornerRadius={6}
                    >
                      {roleDistributionData.map((entry) => (
                        <Cell
                          key={`cell-${entry.roleKey}`}
                          fill={entry.fill}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          nameKey="roleKey"
                          hideIndicator
                          className="bg-background/80 rounded-xl border-none shadow-2xl backdrop-blur-md"
                        />
                      }
                    />
                    <ChartLegend
                      content={<ChartLegendContent nameKey="roleKey" />}
                      className="flex-wrap gap-x-4 gap-y-2 pt-4"
                    />
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {visibility.hourlyActivityPattern && hourlyPatternData.length > 0 && (
            <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="flex items-center text-lg font-bold">
                    {t("hourlyPattern.title")}
                    <ChartHint hint={t("hourlyPattern.hint")} />
                  </CardTitle>
                  <CardDescription>
                    {t("hourlyPattern.description")}
                  </CardDescription>
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
