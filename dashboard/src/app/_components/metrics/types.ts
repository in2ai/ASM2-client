import { type RouterOutputs } from "@/trpc/react";

export type MetricsResponse = RouterOutputs["metrics"]["get"];
export type StatsResponse = RouterOutputs["metrics"]["getStats"];

export interface WorkOSUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}
