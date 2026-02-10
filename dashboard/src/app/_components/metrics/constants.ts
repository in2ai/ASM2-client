import { type ChartConfig } from "@/components/ui/chart";

export const roleChartConfig: ChartConfig = {
  admin: { label: "Admin", color: "hsl(11 84% 60%)" },
  user: { label: "User", color: "hsl(199 89% 62%)" },
  viewer: { label: "Viewer", color: "hsl(330 72% 65%)" },
  manager: { label: "Manager", color: "hsl(43 92% 58%)" },
  other: { label: "Other", color: "hsl(215 20% 65%)" },
};

export const activityChartConfig: ChartConfig = {
  event_count: { label: "Eventos", color: "oklch(0.6 0.25 250)" },
  unique_users: { label: "Usuarios únicos", color: "oklch(0.7 0.2 150)" },
};

export const hourlyChartConfig: ChartConfig = {
  event_count: { label: "Actividad", color: "oklch(0.7 0.2 200)" },
};

export const overviewActivityChartConfig: ChartConfig = {
  event_count: { label: "Eventos", color: "oklch(0.6 0.25 250)" },
};

export const ragResponseTimeChartConfig: ChartConfig = {
  llm_ms: {
    label: "LLM (ms)",
    color: "oklch(0.6 0.25 250)",
  },
  doc_ms: {
    label: "RAG (ms)",
    color: "oklch(0.7 0.2 150)",
  },
};

export const tokenUsageChartConfig: ChartConfig = {
  input: { label: "Entrada", color: "oklch(0.6 0.2 220)" },
  output: { label: "Salida", color: "oklch(0.7 0.25 280)" },
};

export const insightsTopWordsChartConfig: ChartConfig = {
  count: { label: "Búsquedas", color: "oklch(0.7 0.2 200)" },
};

export const insightsTopicsChartConfig: ChartConfig = {
  count: { label: "Menciones", color: "oklch(0.7 0.2 330)" },
};
