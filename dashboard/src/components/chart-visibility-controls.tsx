"use client";

import { type DashboardView } from "@/app/_components/dashboard-views";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getChartsForView } from "@/contexts/chart-visibility-config";
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { Eye, EyeOff, Settings } from "lucide-react";

interface ChartControlsProps {
  readonly view: DashboardView;
}

/**
 * Render a dropdown control for showing and hiding the charts relevant to the provided view.
 *
 * @param view - The current dashboard view that determines the available charts. One of `"overview"`, `"usage"`, `"rag-quality"`, or `"insights"`.
 * @returns A JSX element containing a dropdown menu with controls to toggle individual chart visibility and to show or hide all charts for the given view.
 */
export function ChartVisibilityControls({
  view,
}: Readonly<ChartControlsProps>) {
  const {
    state: { visibility },
    actions: { hideAllCharts, showAllCharts, toggleChart },
  } = useChartVisibility();

  const charts = getChartsForView(view);
  const visibleCount = charts.filter((chart) => visibility[chart.id]).length;

  if (charts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] gap-2"
          aria-label="Configurar visibilidad de gráficos"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">
            Gráficos ({visibleCount}/{charts.length})
          </span>
          <span className="sm:hidden">
            {visibleCount}/{charts.length}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Mostrar/Ocultar Gráficos</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="flex gap-1 p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={showAllCharts}
            className="flex-1 text-xs"
          >
            Mostrar todos
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={hideAllCharts}
            className="flex-1 text-xs"
          >
            Ocultar todos
          </Button>
        </div>

        <DropdownMenuSeparator />

        {charts.map((chart) => (
          <DropdownMenuItem
            key={chart.id}
            onSelect={(event) => {
              event.preventDefault();
              toggleChart(chart.id);
            }}
            className="flex min-h-[44px] cursor-pointer items-center justify-between"
          >
            <span className="text-sm">{chart.label}</span>
            {visibility[chart.id] ? (
              <Eye className="h-4 w-4 text-green-600" />
            ) : (
              <EyeOff className="h-4 w-4 text-gray-400" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
