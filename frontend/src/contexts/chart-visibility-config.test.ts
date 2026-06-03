import { describe, expect, it } from 'vite-plus/test'

import {
  DEFAULT_CHART_VISIBILITY,
  HIDDEN_CHART_VISIBILITY,
  getChartsForView,
} from './chart-visibility-config'

describe('chart visibility config', () => {
  it('returns the configurable charts for each dashboard view', () => {
    expect(getChartsForView('overview')).toHaveLength(0)
    expect(getChartsForView('usage').map((chart) => chart.id)).toEqual([
      'activityTrend',
      'departmentPieChart',
      'hourlyActivityPattern',
    ])
    expect(getChartsForView('rag-quality').map((chart) => chart.id)).toEqual([
      'metricsByTag',
      'tokenUsage',
      'resourceConsumption',
    ])
    expect(getChartsForView('insights').map((chart) => chart.id)).toEqual([
      'topWordsBarChart',
      'topicsBarChart',
    ])
  })

  it('builds all-on and all-off visibility maps for every chart', () => {
    const chartIds = Object.keys(DEFAULT_CHART_VISIBILITY)

    expect(chartIds).toHaveLength(8)
    expect(Object.values(DEFAULT_CHART_VISIBILITY).every(Boolean)).toBe(true)
    expect(Object.values(HIDDEN_CHART_VISIBILITY).some(Boolean)).toBe(false)
    expect(Object.keys(HIDDEN_CHART_VISIBILITY)).toEqual(chartIds)
  })
})
