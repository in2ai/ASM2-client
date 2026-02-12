import {
  Activity,
  BarChart3,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type DashboardView = "overview" | "usage" | "rag-quality" | "insights";

export interface DashboardViewConfig {
  readonly key: DashboardView;
  readonly icon: LucideIcon;
  readonly sidebarLabel: string;
}

export const DASHBOARD_VIEWS: readonly DashboardViewConfig[] = [
  {
    key: "overview",
    icon: BarChart3,
    sidebarLabel: "Vista General",
  },
  {
    key: "usage",
    icon: TrendingUp,
    sidebarLabel: "Uso e Interacción",
  },
  {
    key: "rag-quality",
    icon: Activity,
    sidebarLabel: "Calidad del RAG",
  },
  {
    key: "insights",
    icon: Sparkles,
    sidebarLabel: "Insights",
  },
];
