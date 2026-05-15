import { type ChartConfig } from '@/components/ui/chart'

const ROLE_CHART_COLORS = [
  'hsl(11 84% 60%)',
  'hsl(199 89% 62%)',
  'hsl(330 72% 65%)',
  'hsl(43 92% 58%)',
  'hsl(215 20% 65%)',
  'hsl(160 70% 45%)',
  'hsl(280 65% 62%)',
  'hsl(0 70% 62%)',
] as const

interface RoleDistributionChartItem {
  roleKey: string
  value: number
  fill: string
}

function getRoleChartKey(role: string): string {
  const normalizedKey = role
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

  return normalizedKey || 'role'
}

export function createRoleDistributionChartModel(
  roleDistribution: Record<string, number>,
): {
  config: ChartConfig
  data: RoleDistributionChartItem[]
} {
  const config: ChartConfig = {}
  const data: RoleDistributionChartItem[] = []
  const usedKeys = new Set<string>()

  Object.entries(roleDistribution).forEach(([role, value], index) => {
    const baseKey = getRoleChartKey(role)
    let roleKey = baseKey
    let duplicateIndex = 2

    while (usedKeys.has(roleKey)) {
      roleKey = `${baseKey}_${duplicateIndex}`
      duplicateIndex += 1
    }

    usedKeys.add(roleKey)
    config[roleKey] = {
      label: role,
      color: ROLE_CHART_COLORS[index % ROLE_CHART_COLORS.length],
    }
    data.push({
      roleKey,
      value,
      fill: `var(--color-${roleKey})`,
    })
  })

  return { config, data }
}

export function createActivityChartConfig(labels: {
  events: string
  uniqueUsers: string
}): ChartConfig {
  return {
    event_count: { label: labels.events, color: 'oklch(0.6 0.25 250)' },
    unique_users: { label: labels.uniqueUsers, color: 'oklch(0.7 0.2 150)' },
  }
}

export function createHourlyChartConfig(labels: {
  activity: string
}): ChartConfig {
  return {
    event_count: { label: labels.activity, color: 'oklch(0.7 0.2 200)' },
  }
}

export function createOverviewActivityChartConfig(labels: {
  events: string
}): ChartConfig {
  return {
    event_count: { label: labels.events, color: 'oklch(0.6 0.25 250)' },
  }
}

export function createRagResponseTimeChartConfig(labels: {
  llm: string
  rag: string
}): ChartConfig {
  return {
    llm_ms: {
      label: labels.llm,
      color: 'oklch(0.6 0.25 250)',
    },
    doc_ms: {
      label: labels.rag,
      color: 'oklch(0.7 0.2 150)',
    },
  }
}

export function createTokenUsageChartConfig(labels: {
  input: string
  output: string
}): ChartConfig {
  return {
    input: { label: labels.input, color: 'oklch(0.6 0.2 220)' },
    output: { label: labels.output, color: 'oklch(0.7 0.25 280)' },
  }
}

export function createInsightsTopWordsChartConfig(labels: {
  searches: string
}): ChartConfig {
  return {
    count: { label: labels.searches, color: 'oklch(0.7 0.2 200)' },
  }
}

export function createInsightsTopicsChartConfig(labels: {
  mentions: string
}): ChartConfig {
  return {
    count: { label: labels.mentions, color: 'oklch(0.7 0.2 330)' },
  }
}
