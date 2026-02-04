"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChartVisibility } from "@/contexts/chart-visibility-context";
import { Eye, EyeOff, Settings } from "lucide-react";

interface ChartControlsProps {
  view: "overview" | "usage" | "rag-quality" | "insights";
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
  const { visibility, toggleChart, showAllCharts, hideAllCharts } =
    useChartVisibility();

  const getChartsForView = () => {
    switch (view) {
      case "usage":
        return [
          { id: "activityTrend" as const, label: "Tendencia de actividad" },
          { id: "departmentPieChart" as const, label: "Distribución por rol" },
          { id: "hourlyActivityPattern" as const, label: "Patrón horario" },
        ];
      case "rag-quality":
        return [
          {
            id: "metricsByTag" as const,
            label: "Tendencia de tiempos de respuesta",
          },
          { id: "tokenUsage" as const, label: "Consumo de tokens" },
          { id: "resourceConsumption" as const, label: "Salud del sistema" },
        ];
      case "insights":
        return [
          { id: "topWordsBarChart" as const, label: "Palabras más buscadas" },
          { id: "topicsBarChart" as const, label: "Temas más frecuentes" },
        ];
      default:
        return [];
    }
  };

  const charts = getChartsForView();
  const visibleCount = charts.filter((chart) => visibility[chart.id]).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px] gap-2">
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
            onClick={() => toggleChart(chart.id)}
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
