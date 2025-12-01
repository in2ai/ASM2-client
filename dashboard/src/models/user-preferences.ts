import type { ChartVisibilityState } from "@/contexts/chart-visibility-context";

/**
 * User preferences interface
 * Note: Persistent storage not yet implemented - using in-memory storage
 */
export interface IUserPreferences {
  userId: string;
  chartVisibility: ChartVisibilityState;
  defaultDateRange: number; // days
  theme: "light" | "dark" | "system";
  createdAt: Date;
  updatedAt: Date;
}

