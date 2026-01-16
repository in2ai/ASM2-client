"use client";

import { DateRangeSelector } from "@/components/date-range-selector";
import { ExportButton } from "@/components/export-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { type StatsResponse } from "./types";

interface PersistentHeaderProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  lastUpdated: string | undefined;
  stats: StatsResponse | undefined;
  isFetching: boolean;
  onRefresh: () => void;
}

/**
 * Render a persistent header containing a metrics overview title, update status, and action controls.
 *
 * Displays a loading badge when fetching, shows last-updated text (or a fallback), and optionally the total
 * metrics records when available. Provides a date-range selector, an export button, and a refresh button whose
 * disabled and spinning states reflect the `isFetching` prop.
 *
 * @param dateRange - Currently selected date range for filtering metrics; may be undefined for default scope
 * @param onDateRangeChange - Callback invoked when the date range selection changes
 * @param lastUpdated - Human-readable timestamp of the last update; when omitted, displays a fallback indicating "now"
 * @param stats - Optional metrics summary containing `totalMetricsRecords` used to display total record count
 * @param isFetching - Whether metrics data is currently being fetched; controls loading visuals and refresh button state
 * @param onRefresh - Callback invoked when the refresh action is triggered
 * @returns A React element that renders the metrics header and its controls
 */
export function PersistentHeader({
  dateRange,
  onDateRangeChange,
  lastUpdated,
  stats,
  isFetching,
  onRefresh,
}: Readonly<PersistentHeaderProps>) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8">
      <div className="bg-card/50 flex flex-col gap-4 rounded-2xl border p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Vista General</h2>
            {isFetching && (
              <Badge variant="secondary" className="animate-pulse gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Actualizando
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              {lastUpdated ? `Actualizado ${lastUpdated}` : "Actualizado ahora"}
            </div>
            {stats && (
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                {stats.totalMetricsRecords.toLocaleString()} registros
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <DateRangeSelector value={dateRange} onChange={onDateRangeChange} />
          </div>
          <div className="flex items-center gap-2">
            <ExportButton dateRange={dateRange} />
            <Button
              onClick={onRefresh}
              disabled={isFetching}
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0 rounded-xl"
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin")}
              />
              <span className="sr-only">Actualizar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}