import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";

// Zod schema for chart visibility state
const chartVisibilitySchema = z.record(z.string(), z.boolean());

// Zod schema for updating user preferences
const updatePreferencesSchema = z.object({
  chartVisibility: chartVisibilitySchema.optional(),
  defaultDateRange: z.number().min(1).max(365).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

// Type for user preferences response
type UserPreferencesResponse = {
  userId: string;
  chartVisibility: Record<string, boolean>;
  defaultDateRange?: number;
  theme?: "light" | "dark" | "system";
  createdAt: Date;
  updatedAt: Date;
} | null;

/**
 * Preferences router - Temporary stub implementation
 * TODO: Implement persistent storage for user preferences
 * Requirements 8.1, 8.2: Removed defaultNodeId field and MongoDB dependency
 */
export const preferencesRouter = createTRPCRouter({
  // Get user preferences - returns null (no persistent storage yet)
  get: protectedProcedure.query(async (): Promise<UserPreferencesResponse> => {
    // TODO: Implement persistent storage (e.g., using a key-value store or file system)
    // For now, return null to indicate no saved preferences
    return null;
  }),

  // Update user preferences - stub implementation
  update: protectedProcedure
    .input(updatePreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      // TODO: Implement persistent storage
      // For now, just return the input as if it was saved
      return {
        userId: ctx.userContext.userId,
        chartVisibility: input.chartVisibility ?? {},
        defaultDateRange: input.defaultDateRange,
        theme: input.theme ?? "system",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),

  // Reset preferences to defaults - stub implementation
  reset: protectedProcedure.mutation(async () => {
    // TODO: Implement persistent storage
    return { success: true };
  }),
});
