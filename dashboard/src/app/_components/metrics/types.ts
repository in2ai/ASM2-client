import { type RouterOutputs } from "@/trpc/react";

export type MetricsResponse = RouterOutputs["metrics"]["get"];
export type StatsResponse = RouterOutputs["metrics"]["getStats"];

// Re-export LogtoUser from auth lib for backward compatibility
export type { LogtoUser } from "@/lib/auth";
