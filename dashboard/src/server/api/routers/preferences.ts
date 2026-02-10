import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";

const chartVisibilitySchema = z.record(z.string(), z.boolean());
const themeSchema = z.enum(["light", "dark", "system"]);

const updatePreferencesSchema = z.object({
  chartVisibility: chartVisibilitySchema.optional(),
  defaultDateRange: z.number().min(1).max(365).optional(),
  theme: themeSchema.optional(),
});

type Theme = z.infer<typeof themeSchema>;

type UserPreferencesRecord = {
  userId: string;
  chartVisibility: Record<string, boolean>;
  defaultDateRange?: number;
  theme: Theme;
  createdAt: Date;
  updatedAt: Date;
};

type UserPreferencesResponse = UserPreferencesRecord | null;

const preferencesStore = new Map<string, UserPreferencesRecord>();

function getStoredPreferences(userId: string): UserPreferencesResponse {
  return preferencesStore.get(userId) ?? null;
}

function buildUpdatedPreferences(
  userId: string,
  input: z.infer<typeof updatePreferencesSchema>,
): UserPreferencesRecord {
  const now = new Date();
  const existing = preferencesStore.get(userId);

  return {
    userId,
    chartVisibility: input.chartVisibility ?? existing?.chartVisibility ?? {},
    defaultDateRange: input.defaultDateRange ?? existing?.defaultDateRange,
    theme: input.theme ?? existing?.theme ?? "system",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export const preferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(
    async ({ ctx }): Promise<UserPreferencesResponse> => {
      return getStoredPreferences(ctx.userContext.userId);
    },
  ),

  update: protectedProcedure
    .input(updatePreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const updatedPreferences = buildUpdatedPreferences(
        ctx.userContext.userId,
        input,
      );

      preferencesStore.set(ctx.userContext.userId, updatedPreferences);

      return updatedPreferences;
    }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    preferencesStore.delete(ctx.userContext.userId);
    return { success: true };
  }),
});
