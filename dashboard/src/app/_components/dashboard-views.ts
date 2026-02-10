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
  readonly switcherLabel: string;
  readonly switcherShortLabel: string;
}

export const DASHBOARD_VIEWS: readonly DashboardViewConfig[] = [
  {
    key: "overview",
    icon: BarChart3,
    sidebarLabel: "Vista General",
    switcherLabel: "General",
    switcherShortLabel: "Gen",
  },
  {
    key: "usage",
    icon: TrendingUp,
    sidebarLabel: "Uso e Interacción",
    switcherLabel: "Uso",
    switcherShortLabel: "Uso",
  },
  {
    key: "rag-quality",
    icon: Activity,
    sidebarLabel: "Calidad del RAG",
    switcherLabel: "RAG",
    switcherShortLabel: "RAG",
  },
  {
    key: "insights",
    icon: Sparkles,
    sidebarLabel: "Insights",
    switcherLabel: "Insights",
    switcherShortLabel: "Ins",
  },
];
