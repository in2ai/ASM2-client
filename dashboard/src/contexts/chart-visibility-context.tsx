"use client";

import { api } from "@/trpc/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ChartVisibilityState extends Record<string, boolean> {
  // Usage metrics charts
  usageBarChart: boolean;
  activeSessions: boolean;
  sessionDuration: boolean;
  departmentPieChart: boolean;
  requestsPerUser: boolean;
  responseTime: boolean;
  activityTrend: boolean;
  hourlyActivityPattern: boolean;

  // RAG quality metrics charts
  retrievalRate: boolean;
  retrievalLatency: boolean;
  modelLatency: boolean;
  tokenUsage: boolean;
  documentsRetrieved: boolean;
  metricsByTag: boolean;

  // Performance metrics charts
  responseTimeChart: boolean;
  tokenUsageChart: boolean;
  resourceConsumption: boolean;
  costPerQuery: boolean;
  errorsChart: boolean;
  requestsTrend: boolean;
  latencyDistribution: boolean;
  latencyByEndpoint: boolean;
  errorsByEndpoint: boolean;
  detailedStatusCodes: boolean;

  // Insights charts
  topQueries: boolean;
  commonWords: boolean;
  thematicDistribution: boolean;
  alerts: boolean;
  topWordsBarChart: boolean;
  topicsBarChart: boolean;
}

interface ChartVisibilityContextType {
  visibility: ChartVisibilityState;
  toggleChart: (chartId: keyof ChartVisibilityState) => void;
  showAllCharts: () => void;
  hideAllCharts: () => void;
  isLoading: boolean;
  isSaving: boolean;
}

const defaultVisibility: ChartVisibilityState = {
  // Usage metrics - all visible by default
  usageBarChart: true,
  activeSessions: true,
  sessionDuration: true,
  departmentPieChart: true,
  requestsPerUser: true,
  responseTime: true,
  activityTrend: true,
  hourlyActivityPattern: true,

  // RAG quality metrics - all visible by default
  retrievalRate: true,
  retrievalLatency: true,
  modelLatency: true,
  tokenUsage: true,
  documentsRetrieved: true,
  metricsByTag: true,

  // Performance metrics - all visible by default
  responseTimeChart: true,
  tokenUsageChart: true,
  resourceConsumption: true,
  costPerQuery: true,
  errorsChart: true,
  requestsTrend: true,
  latencyDistribution: true,
  latencyByEndpoint: true,
  errorsByEndpoint: true,
  detailedStatusCodes: true,

  // Insights - all visible by default
  topQueries: true,
  commonWords: true,
  thematicDistribution: true,
  alerts: true,
  topWordsBarChart: true,
  topicsBarChart: true,
};

const ChartVisibilityContext = createContext<ChartVisibilityContextType | null>(
  null,
);

/**
 * Helper to merge saved preferences with defaults
 */
function mergeVisibilityWithDefaults(
  savedVisibility: Record<string, boolean> | undefined,
): ChartVisibilityState {
  if (!savedVisibility) {
    return defaultVisibility;
  }
  const merged = { ...defaultVisibility };
  for (const key in savedVisibility) {
    if (key in merged && savedVisibility[key] !== undefined) {
      merged[key as keyof ChartVisibilityState] = savedVisibility[key];
    }
  }
  return merged;
}

export function ChartVisibilityProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Track local edits that override the server data
  const [localOverrides, setLocalOverrides] =
    useState<ChartVisibilityState | null>(null);

  // Fetch user preferences from database
  const { data: preferences, isLoading } = api.preferences.get.useQuery(
    undefined,
    {
      // Only fetch once on mount
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  // Mutation to update preferences
  const updatePreferencesMutation = api.preferences.update.useMutation();

  // Compute visibility: use local overrides if present, otherwise derive from preferences
  const visibility = useMemo(() => {
    if (localOverrides) {
      return { ...defaultVisibility, ...localOverrides };
    }
    return mergeVisibilityWithDefaults(preferences?.chartVisibility);
  }, [preferences?.chartVisibility, localOverrides]);

  const toggleChart = useCallback(
    (chartId: keyof ChartVisibilityState) => {
      const newVisibility = {
        ...visibility,
        [chartId]: !visibility[chartId],
      };

      // Store locally and save to database
      setLocalOverrides(newVisibility);
      updatePreferencesMutation.mutate({
        chartVisibility: newVisibility,
      });
    },
    [visibility, updatePreferencesMutation],
  );

  const showAllCharts = useCallback(() => {
    setLocalOverrides(defaultVisibility);
    updatePreferencesMutation.mutate({
      chartVisibility: defaultVisibility,
    });
  }, [updatePreferencesMutation]);

  const hideAllCharts = useCallback(() => {
    const allHidden = Object.keys(defaultVisibility).reduce(
      (acc, key) => ({
        ...acc,
        [key]: false,
      }),
      {} as ChartVisibilityState,
    );

    setLocalOverrides(allHidden);
    updatePreferencesMutation.mutate({
      chartVisibility: allHidden,
    });
  }, [updatePreferencesMutation]);

  const value = useMemo(
    () => ({
      visibility,
      toggleChart,
      showAllCharts,
      hideAllCharts,
      isLoading,
      isSaving: updatePreferencesMutation.isPending,
    }),
    [
      visibility,
      toggleChart,
      showAllCharts,
      hideAllCharts,
      isLoading,
      updatePreferencesMutation.isPending,
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
