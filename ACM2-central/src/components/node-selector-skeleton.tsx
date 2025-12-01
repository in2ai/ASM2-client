"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * NodeSelectorSkeleton Component
 *
 * Loading skeleton for the NodeSelector component
 * Displays while nodes are being fetched
 */
export function NodeSelectorSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="hidden h-4 w-4 sm:block" />
      <Skeleton className="h-10 w-[140px] sm:w-[200px]" />
    </div>
  );
}
