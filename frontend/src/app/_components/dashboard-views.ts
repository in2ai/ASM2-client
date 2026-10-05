import {
  Activity,
  BarChart3,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

export const DASHBOARD_VIEW_KEYS = [
  'overview',
  'usage',
  'rag-quality',
  'insights',
] as const

export type DashboardView = (typeof DASHBOARD_VIEW_KEYS)[number]

export function isDashboardView(value: unknown): value is DashboardView {
  return (DASHBOARD_VIEW_KEYS as readonly unknown[]).includes(value)
}

export interface DashboardViewConfig {
  readonly key: DashboardView
  readonly icon: LucideIcon
}

export const DASHBOARD_VIEWS: readonly DashboardViewConfig[] = [
  {
    key: 'overview',
    icon: BarChart3,
  },
  {
    key: 'usage',
    icon: TrendingUp,
  },
  {
    key: 'rag-quality',
    icon: Activity,
  },
  {
    key: 'insights',
    icon: Sparkles,
  },
]
