import {
  Activity,
  BarChart3,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

export type DashboardView = 'overview' | 'usage' | 'rag-quality' | 'insights'

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
