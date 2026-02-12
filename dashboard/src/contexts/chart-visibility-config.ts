import { type DashboardView } from "@/app/_components/dashboard-views";

type ControllableView = Exclude<DashboardView, "overview">;

export const chartsByView = {
  usage: [
    { id: "activityTrend", labelKey: "activityTrend" },
    { id: "departmentPieChart", labelKey: "roleDistribution" },
    { id: "hourlyActivityPattern", labelKey: "hourlyPattern" },
  ],
  "rag-quality": [
    {
      id: "metricsByTag",
      labelKey: "responseTimeTrend",
    },
    { id: "tokenUsage", labelKey: "tokenUsage" },
    { id: "resourceConsumption", labelKey: "systemHealth" },
  ],
  insights: [
    { id: "topWordsBarChart", labelKey: "topWords" },
    { id: "topicsBarChart", labelKey: "topTopics" },
  ],
} as const;

type ChartDefinition = (typeof chartsByView)[ControllableView][number];

export type ChartId = ChartDefinition["id"];
export type ChartVisibilityState = Record<ChartId, boolean>;

const chartIds = Object.values(chartsByView).flatMap((charts) =>
  charts.map((chart) => chart.id),
) as ChartId[];

function buildDefaultVisibility(value: boolean): ChartVisibilityState {
  return chartIds.reduce((acc, chartId) => {
    acc[chartId] = value;
    return acc;
  }, {} as ChartVisibilityState);
}

export const DEFAULT_CHART_VISIBILITY = Object.freeze(
  buildDefaultVisibility(true),
);

export const HIDDEN_CHART_VISIBILITY = Object.freeze(
  buildDefaultVisibility(false),
);

export function getChartsForView(
  view: DashboardView,
): readonly ChartDefinition[] {
  if (view === "overview") {
    return [];
  }

  return chartsByView[view];
}
