"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ChartSkeleton Component
 *
 * Reusable loading skeleton for chart cards
 * Provides better perceived performance while data is loading
 */
export function ChartSkeleton() {
  return (
    <Card className="overflow-hidden rounded-xl">
      <CardHeader>
        <CardTitle>
          <Skeleton className="h-5 w-1/2" />
        </CardTitle>
        <CardDescription>
          <Skeleton className="mt-2 h-4 w-2/3" />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-80 rounded-xl" />
      </CardContent>
    </Card>
  );
}

/**
 * StatCardSkeleton Component
 *
 * Loading skeleton for stat/KPI cards
 */
export function StatCardSkeleton() {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardDescription>
          <Skeleton className="h-3 w-24" />
        </CardDescription>
        <CardTitle>
          <Skeleton className="mt-2 h-8 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}
