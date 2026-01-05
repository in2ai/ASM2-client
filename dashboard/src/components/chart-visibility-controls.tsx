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
  view: "overview" | "usage" | "rag-quality" | "performance" | "insights";
}

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
        return [{ id: "metricsByTag" as const, label: "Métricas por tipo" }];
      case "performance":
        return [
          { id: "tokenUsageChart" as const, label: "Distribución por método" },
          {
            id: "resourceConsumption" as const,
            label: "Distribución por estado",
          },
          { id: "requestsTrend" as const, label: "Tendencia de peticiones" },
          { id: "costPerQuery" as const, label: "Top endpoints" },
          {
            id: "latencyDistribution" as const,
            label: "Distribución de latencia",
          },
          { id: "detailedStatusCodes" as const, label: "Estados detallados" },
          { id: "latencyByEndpoint" as const, label: "Latencia por endpoint" },
          { id: "errorsByEndpoint" as const, label: "Errores por endpoint" },
        ];
      case "insights":
        return [
          { id: "commonWords" as const, label: "Palabras más buscadas" },
          { id: "topQueries" as const, label: "Temas más frecuentes" },
          { id: "topWordsBarChart" as const, label: "Gráfico de palabras" },
          { id: "topicsBarChart" as const, label: "Gráfico de temas" },
          { id: "alerts" as const, label: "Estado del sistema" },
          {
            id: "thematicDistribution" as const,
            label: "Distribución de roles",
          },
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
