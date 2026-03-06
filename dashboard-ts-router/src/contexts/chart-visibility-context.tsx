import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  DEFAULT_CHART_VISIBILITY,
  HIDDEN_CHART_VISIBILITY,
  type ChartId,
  type ChartVisibilityState,
} from '@/contexts/chart-visibility-config'

interface ChartVisibilityContextValue {
  state: {
    visibility: ChartVisibilityState
  }
  actions: {
    toggleChart: (chartId: ChartId) => void
    showAllCharts: () => void
    hideAllCharts: () => void
  }
  meta: {
    isLoading: boolean
    isSaving: boolean
  }
}

const ChartVisibilityContext =
  createContext<ChartVisibilityContextValue | null>(null)

export function ChartVisibilityProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [visibility, setVisibility] = useState<ChartVisibilityState>(
    DEFAULT_CHART_VISIBILITY,
  )

  const toggleChart = useCallback((chartId: ChartId) => {
    setVisibility((current) => ({
      ...current,
      [chartId]: !current[chartId],
    }))
  }, [])

  const showAllCharts = useCallback(() => {
    setVisibility(DEFAULT_CHART_VISIBILITY)
  }, [])

  const hideAllCharts = useCallback(() => {
    setVisibility(HIDDEN_CHART_VISIBILITY)
  }, [])

  const value = useMemo(
    () => ({
      state: { visibility },
      actions: {
        toggleChart,
        showAllCharts,
        hideAllCharts,
      },
      meta: {
        isLoading: false,
        isSaving: false,
      },
    }),
    [hideAllCharts, showAllCharts, toggleChart, visibility],
  )

  return (
    <ChartVisibilityContext.Provider value={value}>
      {children}
    </ChartVisibilityContext.Provider>
  )
}

export function useChartVisibility() {
  const context = useContext(ChartVisibilityContext)
  if (!context) {
    throw new Error(
      'useChartVisibility must be used within a ChartVisibilityProvider',
    )
  }

  return context
}
