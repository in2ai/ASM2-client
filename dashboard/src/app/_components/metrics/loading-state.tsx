"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Renders a skeleton loading UI for dashboard metric cards and larger metric panels.
 *
 * The component outputs two responsive grid sections of animated placeholders: eight small KPI cards and three larger metric cards, preserving layout and spacing while data is loading.
 *
 * @returns The JSX element containing the skeleton loading state for the dashboard metrics.
 */
export function LoadingState() {
  return (
    <div className="animate-in fade-in space-y-6 duration-500 sm:space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((id) => (
          <Card
            key={`kpi-${id}`}
            className="bg-card/60 border-border/50 overflow-hidden rounded-2xl border shadow-sm backdrop-blur-sm"
          >
            <div className="from-primary/5 absolute inset-0 bg-linear-to-br to-transparent" />
            <CardHeader className="relative p-4 pb-2">
              <div className="bg-muted h-8 w-8 animate-pulse rounded-lg" />
              <div className="bg-muted mt-4 h-2 w-16 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-8 w-24 animate-pulse rounded" />
            </CardHeader>
            <CardContent className="relative p-4 pt-0">
              <div className="bg-muted h-2 w-12 animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2, 3].map((id) => (
          <Card
            key={id}
            className="bg-card/60 border-border/50 overflow-hidden rounded-2xl border backdrop-blur-sm lg:even:col-span-2"
          >
            <CardHeader className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="bg-muted h-6 w-48 animate-pulse rounded" />
                  <div className="bg-muted h-4 w-64 animate-pulse rounded" />
                </div>
                <div className="bg-muted h-10 w-10 animate-pulse rounded-xl" />
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="bg-muted/50 h-[300px] w-full animate-pulse rounded-xl" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
