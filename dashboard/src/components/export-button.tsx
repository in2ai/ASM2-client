"use client";

import { Button } from "@/components/ui/button";
import { toIntlLocale } from "@/i18n/config";
import { api, type RouterOutputs } from "@/trpc/react";
import { Download, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
  const t = useTranslations("ExportButton");
  const locale = useLocale();

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
        throw new Error(t("errors.noData"));
      }

      // Generate CSV content
      const csv = generateCSV(result.data, locale);

      // Create filename with date range and timestamp
      const filename = generateFilename(result.data.metadata);

      // Trigger download
      downloadCSV(csv, filename);

      console.log("Export completed successfully");
    } catch (error) {
      console.error("Export error:", error);

      alert(
        error instanceof Error
          ? t("errors.failed", { message: error.message })
          : t("errors.generic"),
      );
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={exportQuery.isFetching}
      size="sm"
      variant="outline"
      className="min-h-11 gap-2"
    >
      {exportQuery.isFetching ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {exportQuery.isFetching ? t("exporting") : t("exportCsv")}
      </span>
      <span className="sm:hidden">{exportQuery.isFetching ? "…" : "CSV"}</span>
    </Button>
  );
}

/**
 * Generate comprehensive CSV content from metrics data
 * Organizes data into clear sections for easy analysis
 */
function generateCSV(data: ExportMetricsOutput, locale: string): string {
  const { data: metricsData, metadata } = data;
  const copy = getCsvCopy(locale);
  const intlLocale = toIntlLocale(locale);

  // Header section
  const headerSection = [
    `# ${copy.reportTitle}`,
    `# ${copy.exported}: ${new Date(metadata.exportTimestamp).toLocaleString(intlLocale)}`,
    ...(metadata.startDate && metadata.endDate
      ? [
          `# ${copy.dateRange}: ${metadata.startDate} ${copy.rangeSeparator} ${metadata.endDate}`,
        ]
      : []),
    "",
  ];

  // Section 1: Summary Metrics
  const summarySection = [
    `=== ${copy.sections.summary} ===`,
    `${copy.columns.metric},${copy.columns.value},${copy.columns.unit}`,
    `${copy.metrics.uniqueUsers},${metricsData.summary.unique_users},${copy.units.users}`,
    `${copy.metrics.totalEvents},${metricsData.summary.total_events},${copy.units.events}`,
    `${copy.metrics.avgSession},${metricsData.summary.avg_session_length_seconds.toFixed(1)},${copy.units.seconds}`,
    `${copy.metrics.avgLlmLatency},${metricsData.summary.avg_llm_response_time_ms.toFixed(2)},ms`,
    `${copy.metrics.docsPerQuery},${metricsData.summary.avg_docs_per_query.toFixed(1)},docs`,
    "",
  ];

  // Section 2: Token Usage
  const tokenSection = [
    `=== ${copy.sections.tokens} ===`,
    `${copy.columns.type},${copy.columns.input},${copy.columns.output},${copy.columns.total}`,
    `LLM,${metricsData.token_usage.llm_tokens_in},${metricsData.token_usage.llm_tokens_out},${metricsData.token_usage.llm_tokens_in + metricsData.token_usage.llm_tokens_out}`,
    `RAG,${metricsData.token_usage.rag_tokens_in},${metricsData.token_usage.rag_tokens_out},${metricsData.token_usage.rag_tokens_in + metricsData.token_usage.rag_tokens_out}`,
    `${copy.columns.total},,${metricsData.token_usage.total_tokens}`,
    "",
  ];

  // Section 3: System Health
  const healthSection = [
    `=== ${copy.sections.systemHealth} ===`,
    `${copy.columns.resource},${copy.columns.averagePercent},${copy.columns.maxPercent}`,
    `CPU,${metricsData.system_health.avg_cpu_percent.toFixed(1)},${metricsData.system_health.max_cpu_percent.toFixed(1)}`,
    `RAM,${metricsData.system_health.avg_ram_percent.toFixed(1)},${metricsData.system_health.max_ram_percent.toFixed(1)}`,
    `GPU,${metricsData.system_health.avg_gpu_percent.toFixed(1)},${metricsData.system_health.max_gpu_percent.toFixed(1)}`,
    "",
  ];

  // Section 4: Role Distribution
  const roles = Object.entries(metricsData.role_distribution);
  const roleSection = [
    `=== ${copy.sections.roleDistribution} ===`,
    `${copy.columns.role},${copy.columns.users}`,
    ...(roles.length > 0
      ? roles.map(([role, count]) => `${escapeCSVCell(role)},${count}`)
      : [`${copy.noData},0`]),
    "",
  ];

  // Section 5: Activity by Day
  const activitySection = [
    `=== ${copy.sections.dailyActivity} ===`,
    `${copy.columns.date},${copy.columns.events},${copy.columns.uniqueUsers}`,
    ...metricsData.activity_by_day.map(
      (day) => `${day.date},${day.event_count},${day.unique_users}`,
    ),
    "",
  ];

  // Section 6: Hourly Pattern
  const hourlySection = [
    `=== ${copy.sections.hourlyPattern} ===`,
    `${copy.columns.hour},${copy.columns.events}`,
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
          `=== ${copy.sections.responseTimeTrend} ===`,
          `${copy.columns.date},LLM (ms),RAG (ms)`,
          ...metricsData.response_time_trend.map(
            (trend) =>
              `${trend.date},${(trend.llm_response_time * 1000).toFixed(2)},${(trend.doc_response_time * 1000).toFixed(2)}`,
          ),
          "",
        ]
      : [];

  // Section 8: Search Terms
  const searchTermsSection = [
    `=== ${copy.sections.topWords} ===`,
    `${copy.columns.word},${copy.columns.frequency}`,
    ...metricsData.search_terms.map(
      (term) => `${escapeCSVCell(term.word)},${term.count}`,
    ),
    "",
  ];

  // Section 9: Topics
  const topicsSection = [
    `=== ${copy.sections.topTopics} ===`,
    `${copy.columns.topic},${copy.columns.frequency}`,
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

function getCsvCopy(locale: string) {
  if (locale === "en") {
    return {
      reportTitle: "ASM2 Metrics Export Report",
      exported: "Exported",
      dateRange: "Date Range",
      rangeSeparator: "to",
      noData: "No data available",
      sections: {
        summary: "SUMMARY",
        tokens: "TOKEN USAGE",
        systemHealth: "SYSTEM HEALTH",
        roleDistribution: "ROLE DISTRIBUTION",
        dailyActivity: "DAILY ACTIVITY",
        hourlyPattern: "HOURLY PATTERN",
        responseTimeTrend: "RESPONSE TIME TREND",
        topWords: "TOP SEARCHED WORDS",
        topTopics: "TOP TOPICS",
      },
      columns: {
        metric: "Metric",
        value: "Value",
        unit: "Unit",
        type: "Type",
        input: "Input",
        output: "Output",
        total: "Total",
        resource: "Resource",
        averagePercent: "Average (%)",
        maxPercent: "Max (%)",
        role: "Role",
        users: "Users",
        date: "Date",
        events: "Events",
        uniqueUsers: "Unique users",
        hour: "Hour",
        word: "Word",
        frequency: "Frequency",
        topic: "Topic",
      },
      metrics: {
        uniqueUsers: "Unique users",
        totalEvents: "Total events",
        avgSession: "Average session",
        avgLlmLatency: "Average LLM latency",
        docsPerQuery: "Docs per query",
      },
      units: {
        users: "users",
        events: "events",
        seconds: "seconds",
      },
    };
  }

  return {
    reportTitle: "ASM2 Metrics Export Report",
    exported: "Exportado",
    dateRange: "Rango de fechas",
    rangeSeparator: "a",
    noData: "Sin datos disponibles",
    sections: {
      summary: "RESUMEN GENERAL",
      tokens: "CONSUMO DE TOKENS",
      systemHealth: "SALUD DEL SISTEMA",
      roleDistribution: "DISTRIBUCION POR ROL",
      dailyActivity: "ACTIVIDAD DIARIA",
      hourlyPattern: "PATRON HORARIO",
      responseTimeTrend: "TENDENCIA DE TIEMPOS DE RESPUESTA",
      topWords: "PALABRAS MAS BUSCADAS",
      topTopics: "TEMAS MAS FRECUENTES",
    },
    columns: {
      metric: "Metrica",
      value: "Valor",
      unit: "Unidad",
      type: "Tipo",
      input: "Entrada",
      output: "Salida",
      total: "Total",
      resource: "Recurso",
      averagePercent: "Promedio (%)",
      maxPercent: "Maximo (%)",
      role: "Rol",
      users: "Usuarios",
      date: "Fecha",
      events: "Eventos",
      uniqueUsers: "Usuarios unicos",
      hour: "Hora",
      word: "Palabra",
      frequency: "Frecuencia",
      topic: "Tema",
    },
    metrics: {
      uniqueUsers: "Usuarios unicos",
      totalEvents: "Eventos totales",
      avgSession: "Sesion media",
      avgLlmLatency: "Latencia LLM promedio",
      docsPerQuery: "Documentos por consulta",
    },
    units: {
      users: "usuarios",
      events: "eventos",
      seconds: "segundos",
    },
  };
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
