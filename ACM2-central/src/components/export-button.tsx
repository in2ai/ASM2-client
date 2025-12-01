"use client";

import { Button } from "@/components/ui/button";
import { api, type RouterOutputs } from "@/trpc/react";
import { Download, Loader2 } from "lucide-react";
import { type DateRange } from "react-day-picker";

interface ExportButtonProps {
  readonly nodeId?: string;
  readonly dateRange?: DateRange;
}

type ExportMetricsOutput = RouterOutputs["metrics"]["exportMetrics"];
type MetricData = ExportMetricsOutput["metrics"][number];

/**
 * ExportButton Component
 *
 * Provides CSV export functionality for metrics data.
 * Respects authorization rules and limits exports to 10,000 rows.
 */
export function ExportButton({ nodeId, dateRange }: ExportButtonProps) {
  // Use TRPC query with manual trigger
  const exportQuery = api.metrics.exportMetrics.useQuery(
    {
      nodeId,
      startDate: dateRange?.from,
      endDate: dateRange?.to,
    },
    {
      enabled: false, // Don't run automatically
    },
  );

  const handleExport = async () => {
    try {
      // Manually trigger the query
      const result = await exportQuery.refetch();

      if (!result.data) {
        throw new Error("No se pudieron obtener los datos para exportar");
      }

      // Generate CSV content
      const csv = generateCSV(result.data.metrics);

      // Create filename with node name, date range, and timestamp
      const filename = generateFilename(result.data.metadata);

      // Trigger download
      downloadCSV(csv, filename);

      // Success feedback
      console.log(
        `Export completed: ${result.data.metadata.totalRecords} records exported`,
      );
    } catch (error) {
      console.error("Export error:", error);

      // Show error alert
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
 * Generate CSV content from metrics data
 */
function generateCSV(metrics: MetricData[]): string {
  if (metrics.length === 0) {
    return "";
  }

  // Define CSV headers
  const headers = [
    "Timestamp",
    "Node ID",
    "Daily Users",
    "Weekly Users",
    "Monthly Users",
    "Daily Sessions",
    "Weekly Sessions",
    "Monthly Sessions",
    "Avg Session Duration (min)",
    "Total Queries",
    "Successful Retrieval Rate (%)",
    "Retrieval Latency (ms)",
    "Avg Context Tokens",
    "Avg Response Time (ms)",
    "Avg Prompt Tokens",
    "Avg Completion Tokens",
    "Avg Total Tokens",
    "CPU Usage (%)",
    "Memory Usage (MB)",
    "Cost Per Query ($)",
    "Timeout Errors",
    "Retrieval Failure Errors",
    "Model Call Failure Errors",
    "Other Errors",
  ];

  // Generate CSV rows
  const rows = metrics.map((metric) => {
    return [
      new Date(metric.timestamp).toISOString(),
      metric.nodeId,
      metric.usage_metrics.unique_users.daily,
      metric.usage_metrics.unique_users.weekly,
      metric.usage_metrics.unique_users.monthly,
      metric.usage_metrics.active_sessions.daily,
      metric.usage_metrics.active_sessions.weekly,
      metric.usage_metrics.active_sessions.monthly,
      metric.usage_metrics.session_duration.average_minutes.toFixed(2),
      metric.usage_metrics.processed_queries.total,
      metric.rag_quality_metrics.successful_retrieval_rate.toFixed(2),
      metric.rag_quality_metrics.retrieval_latency_ms.toFixed(2),
      metric.rag_quality_metrics.average_context_tokens.toFixed(0),
      metric.performance_metrics.average_response_time_ms.toFixed(2),
      metric.performance_metrics.token_usage.average_prompt.toFixed(0),
      metric.performance_metrics.token_usage.average_completion.toFixed(0),
      metric.performance_metrics.token_usage.average_total.toFixed(0),
      metric.performance_metrics.resource_consumption.cpu_percent.toFixed(2),
      metric.performance_metrics.resource_consumption.memory_mb.toFixed(0),
      metric.performance_metrics.cost_per_query.toFixed(4),
      metric.performance_metrics.errors.timeout,
      metric.performance_metrics.errors.retrieval_failure,
      metric.performance_metrics.errors.model_call_failure,
      metric.performance_metrics.errors.other,
    ];
  });

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => escapeCSVCell(cell)).join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Escape CSV cell content to handle commas, quotes, and newlines
 */
function escapeCSVCell(
  cell: string | number | boolean | null | undefined,
): string {
  const value = String(cell ?? "");

  // If the value contains comma, quote, or newline, wrap it in quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

/**
 * Generate filename with node name, date range, and timestamp
 */
function generateFilename(metadata: {
  nodeName: string;
  startDate?: string;
  endDate?: string;
  exportTimestamp: string;
}): string {
  const parts = ["metrics", metadata.nodeName];

  // Add date range if available
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

  // Add export timestamp
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

  // Create download link
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Clean up
  URL.revokeObjectURL(url);
}
