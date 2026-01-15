"use client";

import { Button } from "@/components/ui/button";
import { api, type RouterOutputs } from "@/trpc/react";
import { Download, Loader2 } from "lucide-react";
import { type DateRange } from "react-day-picker";

interface ExportButtonProps {
  readonly dateRange?: DateRange;
}

type ExportMetricsOutput = RouterOutputs["metrics"]["exportMetrics"];

/**
 * ExportButton Component
 *
 * Provides comprehensive CSV export functionality for all metrics data.
 */
export function ExportButton({ dateRange }: ExportButtonProps) {
  const exportQuery = api.metrics.exportMetrics.useQuery(
    {
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      enabled: false,
    },
  );

  const handleExport = async () => {
    try {
      const result = await exportQuery.refetch();

      if (!result.data) {
        throw new Error("No se pudieron obtener los datos para exportar");
      }

      // Generate CSV content
      const csv = generateCSV(result.data);

      // Create filename with date range and timestamp
      const filename = generateFilename(result.data.metadata);

      // Trigger download
      downloadCSV(csv, filename);

      console.log("Export completed successfully");
    } catch (error) {
      console.error("Export error:", error);

      alert(
        error instanceof Error
          ? `Error al exportar: ${error.message}`
          : "No se pudo exportar los datos. Por favor, intenta nuevamente.",
      );
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={exportQuery.isFetching}
      size="sm"
      variant="outline"
      className="min-h-[44px] gap-2"
    >
      {exportQuery.isFetching ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {exportQuery.isFetching ? "Exportando..." : "Exportar CSV"}
      </span>
      <span className="sm:hidden">
        {exportQuery.isFetching ? "..." : "CSV"}
      </span>
    </Button>
  );
}

/**
 * Generate comprehensive CSV content from metrics data
 * Organizes data into clear sections for easy analysis
 */
function generateCSV(data: ExportMetricsOutput): string {
  const { data: metricsData, metadata } = data;

  // Header section
  const headerSection = [
    "# ASM2 Metrics Export Report",
    `# Exported: ${new Date(metadata.exportTimestamp).toLocaleString("es-ES")}`,
    ...(metadata.startDate && metadata.endDate
      ? [`# Date Range: ${metadata.startDate} to ${metadata.endDate}`]
      : []),
    "",
  ];

  // Section 1: Summary Metrics
  const summarySection = [
    "=== RESUMEN GENERAL ===",
    "Métrica,Valor,Unidad",
    `Usuarios únicos,${metricsData.summary.unique_users},usuarios`,
    `Eventos totales,${metricsData.summary.total_events},eventos`,
    `Sesión media,${metricsData.summary.avg_session_length_seconds.toFixed(1)},segundos`,
    `Latencia LLM promedio,${metricsData.summary.avg_llm_response_time_ms.toFixed(2)},ms`,
    `Documentos por consulta,${metricsData.summary.avg_docs_per_query.toFixed(1)},docs`,
    "",
  ];

  // Section 2: Token Usage
  const tokenSection = [
    "=== CONSUMO DE TOKENS ===",
    "Tipo,Entrada,Salida,Total",
    `LLM,${metricsData.token_usage.llm_tokens_in},${metricsData.token_usage.llm_tokens_out},${metricsData.token_usage.llm_tokens_in + metricsData.token_usage.llm_tokens_out}`,
    `RAG,${metricsData.token_usage.rag_tokens_in},${metricsData.token_usage.rag_tokens_out},${metricsData.token_usage.rag_tokens_in + metricsData.token_usage.rag_tokens_out}`,
    `Total,,${metricsData.token_usage.total_tokens}`,
    "",
  ];

  // Section 3: System Health
  const healthSection = [
    "=== SALUD DEL SISTEMA ===",
    "Recurso,Promedio (%),Máximo (%)",
    `CPU,${metricsData.system_health.avg_cpu_percent.toFixed(1)},${metricsData.system_health.max_cpu_percent.toFixed(1)}`,
    `RAM,${metricsData.system_health.avg_ram_percent.toFixed(1)},${metricsData.system_health.max_ram_percent.toFixed(1)}`,
    `GPU,${metricsData.system_health.avg_gpu_percent.toFixed(1)},${metricsData.system_health.max_gpu_percent.toFixed(1)}`,
    "",
  ];

  // Section 4: Role Distribution
  const roles = Object.entries(metricsData.role_distribution);
  const roleSection = [
    "=== DISTRIBUCIÓN POR ROL ===",
    "Rol,Usuarios",
    ...(roles.length > 0
      ? roles.map(([role, count]) => `${escapeCSVCell(role)},${count}`)
      : ["Sin datos disponibles,0"]),
    "",
  ];

  // Section 5: Activity by Day
  const activitySection = [
    "=== ACTIVIDAD DIARIA ===",
    "Fecha,Eventos,Usuarios únicos",
    ...metricsData.activity_by_day.map(
      (day) => `${day.date},${day.event_count},${day.unique_users}`,
    ),
    "",
  ];

  // Section 6: Hourly Pattern
  const hourlySection = [
    "=== PATRÓN HORARIO ===",
    "Hora,Eventos",
    ...metricsData.hourly_pattern.map(
      (hour) =>
        `${hour.hour.toString().padStart(2, "0")}:00,${hour.event_count}`,
    ),
    "",
  ];

  // Section 7: Response Time Trends (conditional)
  const responseTimeSection =
    metricsData.response_time_trend.length > 0
      ? [
          "=== TENDENCIA DE TIEMPOS DE RESPUESTA ===",
          "Fecha,LLM (ms),RAG (ms)",
          ...metricsData.response_time_trend.map(
            (trend) =>
              `${trend.date},${(trend.llm_response_time * 1000).toFixed(2)},${(trend.doc_response_time * 1000).toFixed(2)}`,
          ),
          "",
        ]
      : [];

  // Section 8: Search Terms
  const searchTermsSection = [
    "=== PALABRAS MÁS BUSCADAS ===",
    "Palabra,Frecuencia",
    ...metricsData.search_terms.map(
      (term) => `${escapeCSVCell(term.word)},${term.count}`,
    ),
    "",
  ];

  // Section 9: Topics
  const topicsSection = [
    "=== TEMAS MÁS FRECUENTES ===",
    "Tema,Frecuencia",
    ...metricsData.topics.map(
      (topic) => `${escapeCSVCell(topic.topic)},${topic.count}`,
    ),
  ];

  // Combine all sections
  return [
    ...headerSection,
    ...summarySection,
    ...tokenSection,
    ...healthSection,
    ...roleSection,
    ...activitySection,
    ...hourlySection,
    ...responseTimeSection,
    ...searchTermsSection,
    ...topicsSection,
  ].join("\n");
}

/**
 * Escape CSV cell content to handle commas, quotes, and newlines
 */
function escapeCSVCell(
  cell: string | number | boolean | null | undefined,
): string {
  const value = String(cell ?? "");

  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

/**
 * Generate filename with date range and timestamp
 */
function generateFilename(metadata: {
  startDate?: string;
  endDate?: string;
  exportTimestamp: string;
}): string {
  const parts = ["asm2_metrics"];

  if (metadata.startDate && metadata.endDate) {
    const start = new Date(metadata.startDate).toISOString().split("T")[0];
    const end = new Date(metadata.endDate).toISOString().split("T")[0];
    parts.push(`${start}_to_${end}`);
  } else if (metadata.startDate) {
    const start = new Date(metadata.startDate).toISOString().split("T")[0];
    parts.push(`from_${start}`);
  } else if (metadata.endDate) {
    const end = new Date(metadata.endDate).toISOString().split("T")[0];
    parts.push(`until_${end}`);
  }

  const timestamp = new Date(metadata.exportTimestamp)
    .toISOString()
    .replaceAll(/[:.]/g, "-")
    .split("T")[0];
  if (timestamp) {
    parts.push(timestamp);
  }

  return `${parts.join("_")}.csv`;
}

/**
 * Trigger CSV download in the browser
 */
function downloadCSV(csvContent: string, filename: string): void {
  // Create a Blob with UTF-8 BOM for proper Excel compatibility
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
