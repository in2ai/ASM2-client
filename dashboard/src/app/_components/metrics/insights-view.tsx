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
import { BarChart3, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartHint } from "./chart-hint";
import {
  createInsightsTopWordsChartConfig,
  createInsightsTopicsChartConfig,
} from "./constants";
import { type MetricsResponse } from "./types";

interface InsightsViewProps {
  metrics: MetricsResponse;
}

/**
 * Render insight charts for word and topic frequency analysis.
 * Displays bar charts for top words and topics from the word_counts and topic_counts tables.
 */
export function InsightsView({ metrics }: Readonly<InsightsViewProps>) {
  const t = useTranslations("InsightsView");

  const {
    state: { visibility },
  } = useChartVisibility();
  const insightsTopWordsChartConfig = useMemo(
    () =>
      createInsightsTopWordsChartConfig({
        searches: t("chartLabels.searches"),
      }),
    [t],
  );
  const insightsTopicsChartConfig = useMemo(
    () =>
      createInsightsTopicsChartConfig({
        mentions: t("chartLabels.mentions"),
      }),
    [t],
  );
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
        topic: item.topic,
        fullTopic: item.topic,
        count: item.count,
      })),
    [topTopics],
  );

  const hasNoData = topWords.length === 0 && topTopics.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        <div className="bg-border mt-3 h-px" />
      </div>

      {hasNoData ? (
        <div className="bg-card/20 flex h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center backdrop-blur-sm">
          <div className="bg-muted text-muted-foreground rounded-full p-3">
            <BarChart3 size={24} />
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            {t("noData")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {visibility.topWordsBarChart && topWordsBarData.length > 0 && (
            <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="flex items-center text-lg font-bold">
                    {t("topWords.title")}
                    <ChartHint hint={t("topWords.hint")} />
                  </CardTitle>
                  <CardDescription>{t("topWords.description")}</CardDescription>
                </div>
                <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                  <BarChart3 size={18} />
                </div>
              </CardHeader>
              <CardContent className="overflow-hidden p-0 pt-4">
                <ChartContainer
                  config={insightsTopWordsChartConfig}
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
            <Card className="bg-card/60 border-border/50 hover:shadow-primary/5 overflow-hidden rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="flex items-center text-lg font-bold">
                    {t("topTopics.title")}
                    <ChartHint hint={t("topTopics.hint")} />
                  </CardTitle>
                  <CardDescription>
                    {t("topTopics.description")}
                  </CardDescription>
                </div>
                <div className="bg-primary/10 text-primary rounded-xl p-2.5">
                  <TrendingUp size={18} />
                </div>
              </CardHeader>
              <CardContent className="overflow-hidden p-0 pt-4">
                <ChartContainer
                  config={insightsTopicsChartConfig}
                  className="h-[400px] w-full"
                >
                  <BarChart
                    data={topicsBarData}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
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
                      width={180}
                      style={{ fontSize: 11 }}
                      tick={(props: {
                        x: number;
                        y: number;
                        payload: { value: string };
                      }) => (
                        <text
                          x={props.x}
                          y={props.y}
                          dy={4}
                          textAnchor="end"
                          fill="currentColor"
                          style={{ fontSize: 11 }}
                        >
                          <title>{props.payload.value}</title>
                          {props.payload.value.length > 28
                            ? props.payload.value.substring(0, 28) + "..."
                            : props.payload.value}
                        </text>
                      )}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const data = payload?.[0]?.payload as
                              | { fullTopic?: string }
                              | undefined;
                            return data?.fullTopic ?? "";
                          }}
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
      )}
    </div>
  );
}
