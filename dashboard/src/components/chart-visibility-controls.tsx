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
          { id: "usageBarChart" as const, label: "Usuarios únicos activos" },
          { id: "activeSessions" as const, label: "Sesiones activas" },
          { id: "sessionDuration" as const, label: "Duración media de sesión" },
          {
            id: "departmentPieChart" as const,
            label: "Distribución por rol",
          },
          { id: "requestsPerUser" as const, label: "Peticiones por usuario" },
          { id: "responseTime" as const, label: "Tiempo de respuesta total" },
          { id: "activityTrend" as const, label: "Tendencia de actividad" },
          { id: "hourlyActivityPattern" as const, label: "Patrón horario" },
        ];
      case "rag-quality":
        return [
          {
            id: "retrievalRate" as const,
            label: "Tasa de recuperación con éxito",
          },
          { id: "retrievalLatency" as const, label: "Latency de recuperación" },
          { id: "modelLatency" as const, label: "Latencia del modelo" },
          { id: "tokenUsage" as const, label: "Tokens de entrada y salida" },
          {
            id: "documentsRetrieved" as const,
            label: "Documentos recuperados",
          },
          { id: "metricsByTag" as const, label: "Métricas por tipo" },
        ];
      case "performance":
        return [
          {
            id: "responseTimeChart" as const,
            label: "Tiempo medio de respuesta",
          },
          { id: "tokenUsageChart" as const, label: "Métodos HTTP" },
          {
            id: "resourceConsumption" as const,
            label: "Códigos de estado",
          },
          { id: "costPerQuery" as const, label: "Top endpoints" },
          { id: "errorsChart" as const, label: "Errores por tipo" },
          { id: "requestsTrend" as const, label: "Tendencia de peticiones" },
          {
            id: "latencyDistribution" as const,
            label: "Distribución de latencia",
          },
          { id: "latencyByEndpoint" as const, label: "Latencia por endpoint" },
          { id: "errorsByEndpoint" as const, label: "Errores por endpoint" },
          { id: "detailedStatusCodes" as const, label: "Códigos detallados" },
        ];
      case "insights":
        return [
          { id: "topQueries" as const, label: "Temas frecuentes" },
          { id: "commonWords" as const, label: "Palabras más buscadas" },
          {
            id: "thematicDistribution" as const,
            label: "Distribución de roles",
          },
          { id: "alerts" as const, label: "Estado del sistema" },
          { id: "topWordsBarChart" as const, label: "Gráfico de palabras" },
          { id: "topicsBarChart" as const, label: "Gráfico de temas" },
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
