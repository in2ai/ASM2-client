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
 * Provides CSV export functionality for metrics data.
 * Requirement 3.4: Removed nodeId parameter - single-node architecture
 */
export function ExportButton({ dateRange }: ExportButtonProps) {
  // Use TRPC query with manual trigger
  // Requirement 3.4: Removed nodeId parameter
  const exportQuery = api.metrics.exportMetrics.useQuery(
    {
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
 * Updated for new metrics_service data structure
 */
function generateCSV(metrics: ExportMetricsOutput["metrics"]): string {
  if (metrics.length === 0) {
    return "";
  }

  // Define CSV headers - simplified for new data structure
  const headers = [
    "Metric Type",
    "Value",
    "Unit",
  ];

  // Generate CSV rows from the new flat structure
  const rows = metrics.map((metric) => {
    return [
      metric.metric_type,
      metric.value,
      metric.unit,
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
 * Generate filename with date range and timestamp
 * Requirement 3.4: Removed nodeName - single-node architecture
 */
function generateFilename(metadata: {
  startDate?: string;
  endDate?: string;
  exportTimestamp: string;
}): string {
  const parts = ["metrics"];

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
