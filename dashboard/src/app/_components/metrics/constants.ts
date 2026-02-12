import { type ChartConfig } from "@/components/ui/chart";

export function createRoleChartConfig(labels: {
  admin: string;
  user: string;
  viewer: string;
  manager: string;
  other: string;
}): ChartConfig {
  return {
    admin: { label: labels.admin, color: "hsl(11 84% 60%)" },
    user: { label: labels.user, color: "hsl(199 89% 62%)" },
    viewer: { label: labels.viewer, color: "hsl(330 72% 65%)" },
    manager: { label: labels.manager, color: "hsl(43 92% 58%)" },
    other: { label: labels.other, color: "hsl(215 20% 65%)" },
  };
}

export function createActivityChartConfig(labels: {
  events: string;
  uniqueUsers: string;
}): ChartConfig {
  return {
    event_count: { label: labels.events, color: "oklch(0.6 0.25 250)" },
    unique_users: { label: labels.uniqueUsers, color: "oklch(0.7 0.2 150)" },
  };
}

export function createHourlyChartConfig(labels: {
  activity: string;
}): ChartConfig {
  return {
    event_count: { label: labels.activity, color: "oklch(0.7 0.2 200)" },
  };
}

export function createOverviewActivityChartConfig(labels: {
  events: string;
}): ChartConfig {
  return {
    event_count: { label: labels.events, color: "oklch(0.6 0.25 250)" },
  };
}

export function createRagResponseTimeChartConfig(labels: {
  llm: string;
  rag: string;
}): ChartConfig {
  return {
    llm_ms: {
      label: labels.llm,
      color: "oklch(0.6 0.25 250)",
    },
    doc_ms: {
      label: labels.rag,
      color: "oklch(0.7 0.2 150)",
    },
  };
}

export function createTokenUsageChartConfig(labels: {
  input: string;
  output: string;
}): ChartConfig {
  return {
    input: { label: labels.input, color: "oklch(0.6 0.2 220)" },
    output: { label: labels.output, color: "oklch(0.7 0.25 280)" },
  };
}

export function createInsightsTopWordsChartConfig(labels: {
  searches: string;
}): ChartConfig {
  return {
    count: { label: labels.searches, color: "oklch(0.7 0.2 200)" },
  };
}

export function createInsightsTopicsChartConfig(labels: {
  mentions: string;
}): ChartConfig {
  return {
    count: { label: labels.mentions, color: "oklch(0.7 0.2 330)" },
  };
}
