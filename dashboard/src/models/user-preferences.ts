import type { ChartVisibilityState } from "@/contexts/chart-visibility-context";
import mongoose from "mongoose";

export interface IUserPreferences {
  userId: string;
  chartVisibility: ChartVisibilityState;
  defaultDateRange: number; // days
  defaultNodeId?: string; // For admins
  theme: "light" | "dark" | "system";
  createdAt: Date;
  updatedAt: Date;
}

const userPreferencesSchema = new mongoose.Schema<IUserPreferences>(
  {
    userId: { type: String, required: true, unique: true },
    chartVisibility: {
      type: Map,
      of: Boolean,
      default: {},
    },
    defaultDateRange: { type: Number, default: 30 },
    defaultNodeId: { type: String },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
  },
  { timestamps: true },
);

export const UserPreferences =
  (mongoose.models.UserPreferences as mongoose.Model<IUserPreferences>) ||
  mongoose.model<IUserPreferences>("UserPreferences", userPreferencesSchema);

export { userPreferencesSchema };

