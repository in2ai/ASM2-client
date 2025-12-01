import { connectDB } from "@/lib/db";
import { UserPreferences } from "@/models/user-preferences";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Zod schema for chart visibility state
const chartVisibilitySchema = z.record(z.string(), z.boolean());

// Zod schema for updating user preferences
const updatePreferencesSchema = z.object({
  chartVisibility: chartVisibilitySchema.optional(),
  defaultDateRange: z.number().min(1).max(365).optional(),
  defaultNodeId: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export const preferencesRouter = createTRPCRouter({
  // Get user preferences
  get: protectedProcedure.query(async ({ ctx }) => {
    try {
      await connectDB();

      // Fetch preferences for the current user
      const preferences = await UserPreferences.findOne({
        userId: ctx.userContext.userId,
      })
        .lean()
        .exec();

      // Return preferences or null if not found
      if (!preferences) {
        return null;
      }

      // Convert Map to plain object for chartVisibility
      let chartVisibility: Record<string, boolean> = {};
      if (preferences.chartVisibility instanceof Map) {
        chartVisibility = Object.fromEntries(
          preferences.chartVisibility,
        ) as Record<string, boolean>;
      } else if (preferences.chartVisibility) {
        chartVisibility = preferences.chartVisibility as Record<
          string,
          boolean
        >;
      }

      return {
        userId: preferences.userId,
        chartVisibility,
        defaultDateRange: preferences.defaultDateRange,
        defaultNodeId: preferences.defaultNodeId,
        theme: preferences.theme,
        createdAt: preferences.createdAt,
        updatedAt: preferences.updatedAt,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch user preferences",
        cause: error,
      });
    }
  }),

  // Update user preferences
  update: protectedProcedure
    .input(updatePreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await connectDB();

        // Build update object
        const updateData: Record<string, unknown> = {};

        if (input.chartVisibility !== undefined) {
          updateData.chartVisibility = input.chartVisibility;
        }

        if (input.defaultDateRange !== undefined) {
          updateData.defaultDateRange = input.defaultDateRange;
        }

        if (input.defaultNodeId !== undefined) {
          // Only admins can set default node
          if (ctx.userContext.role === "admin") {
            updateData.defaultNodeId = input.defaultNodeId;
          }
        }

        if (input.theme !== undefined) {
          updateData.theme = input.theme;
        }

        // Upsert preferences (create if doesn't exist, update if exists)
        // Use lean() for better performance on read-only operations
        const preferences = await UserPreferences.findOneAndUpdate(
          { userId: ctx.userContext.userId },
          { $set: updateData },
          { upsert: true, new: true },
        )
          .select({
            userId: 1,
            chartVisibility: 1,
            defaultDateRange: 1,
            defaultNodeId: 1,
            theme: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .lean()
          .exec();

        if (!preferences) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save preferences",
          });
        }

        // Convert Map to plain object for chartVisibility
        let chartVisibility: Record<string, boolean> = {};
        if (preferences.chartVisibility instanceof Map) {
          chartVisibility = Object.fromEntries(
            preferences.chartVisibility,
          ) as Record<string, boolean>;
        } else if (preferences.chartVisibility) {
          chartVisibility = preferences.chartVisibility as Record<
            string,
            boolean
          >;
        }

        return {
          userId: preferences.userId,
          chartVisibility,
          defaultDateRange: preferences.defaultDateRange,
          defaultNodeId: preferences.defaultNodeId,
          theme: preferences.theme,
          createdAt: preferences.createdAt,
          updatedAt: preferences.updatedAt,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update user preferences",
          cause: error,
        });
      }
    }),

  // Reset preferences to defaults
  reset: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      await connectDB();

      // Delete user preferences to reset to defaults
      await UserPreferences.findOneAndDelete({
        userId: ctx.userContext.userId,
      }).exec();

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to reset user preferences",
        cause: error,
      });
    }
  }),
});
