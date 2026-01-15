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
