"use client";

import {
  DEFAULT_CHART_VISIBILITY,
  HIDDEN_CHART_VISIBILITY,
  type ChartId,
  type ChartVisibilityState,
} from "@/contexts/chart-visibility-config";
import { api } from "@/trpc/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ChartVisibilityContextValue {
  state: {
    visibility: ChartVisibilityState;
  };
  actions: {
    toggleChart: (chartId: ChartId) => void;
    showAllCharts: () => void;
    hideAllCharts: () => void;
  };
  meta: {
    isLoading: boolean;
    isSaving: boolean;
  };
}

const ChartVisibilityContext =
  createContext<ChartVisibilityContextValue | null>(null);

function mergeVisibilityWithDefaults(
  savedVisibility: Record<string, boolean> | undefined,
): ChartVisibilityState {
  if (!savedVisibility) {
    return DEFAULT_CHART_VISIBILITY;
  }

  const merged = { ...DEFAULT_CHART_VISIBILITY };
  for (const [key, value] of Object.entries(savedVisibility)) {
    if (key in merged) {
      merged[key as ChartId] = value;
    }
  }

  return merged;
}

export function ChartVisibilityProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [localOverrides, setLocalOverrides] =
    useState<ChartVisibilityState | null>(null);

  const { data: preferences, isLoading } = api.preferences.get.useQuery(
    undefined,
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const updatePreferencesMutation = api.preferences.update.useMutation();

  const visibility = useMemo(() => {
    if (localOverrides) {
      return localOverrides;
    }

    return mergeVisibilityWithDefaults(preferences?.chartVisibility);
  }, [localOverrides, preferences?.chartVisibility]);

  const visibilityRef = useRef<ChartVisibilityState>(visibility);
  useEffect(() => {
    visibilityRef.current = visibility;
  }, [visibility]);

  const persistVisibility = useCallback(
    (nextVisibility: ChartVisibilityState) => {
      setLocalOverrides(nextVisibility);
      updatePreferencesMutation.mutate({
        chartVisibility: nextVisibility,
      });
    },
    [updatePreferencesMutation],
  );

  const toggleChart = useCallback(
    (chartId: ChartId) => {
      const current = visibilityRef.current;
      persistVisibility({
        ...current,
        [chartId]: !current[chartId],
      });
    },
    [persistVisibility],
  );

  const showAllCharts = useCallback(() => {
    persistVisibility(DEFAULT_CHART_VISIBILITY);
  }, [persistVisibility]);

  const hideAllCharts = useCallback(() => {
    persistVisibility(HIDDEN_CHART_VISIBILITY);
  }, [persistVisibility]);

  const value = useMemo(
    () => ({
      state: { visibility },
      actions: {
        toggleChart,
        showAllCharts,
        hideAllCharts,
      },
      meta: {
        isLoading,
        isSaving: updatePreferencesMutation.isPending,
      },
    }),
    [
      hideAllCharts,
      isLoading,
      showAllCharts,
      toggleChart,
      updatePreferencesMutation.isPending,
      visibility,
    ],
  );

  return (
    <ChartVisibilityContext.Provider value={value}>
      {children}
    </ChartVisibilityContext.Provider>
  );
}

export function useChartVisibility() {
  const context = useContext(ChartVisibilityContext);
  if (!context) {
    throw new Error(
      "useChartVisibility must be used within a ChartVisibilityProvider",
    );
  }

  return context;
}
