"use client";

import { NodeSelectorSkeleton } from "@/components/node-selector-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/trpc/react";
import { Building2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * NodeSelector Component
 *
 * A dropdown component for administrators to select and switch between different
 * nodes/companies. Fetches available nodes using the metrics.listNodes query and
 * updates the URL parameter when a node is selected.
 *
 * Features:
 * - Displays all active nodes in a dropdown
 * - Includes "All Nodes" option for global view
 * - Updates URL with selected nodeId for deep linking
 * - Handles loading and error states
 * - Only visible to administrators
 */
export function NodeSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentNodeId = searchParams.get("nodeId") ?? "all";

  // Fetch available nodes using the admin-only listNodes query
  const {
    data: nodes,
    isLoading,
    error,
  } = api.metrics.listNodes.useQuery({
    includeInactive: false,
  });

  /**
   * Handle node selection and update URL parameter
   * @param nodeId - The selected node ID or "all" for global view
   */
  const handleNodeChange = (nodeId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nodeId === "all") {
      // Remove nodeId parameter for "All Nodes" view
      params.delete("nodeId");
    } else {
      // Set nodeId parameter for specific node
      params.set("nodeId", nodeId);
    }

    // Update URL with new parameters
    const newUrl = params.toString() ? `?${params.toString()}` : "";
    router.push(newUrl);
  };

  // Loading state - use skeleton for better perceived performance
  if (isLoading) {
    return <NodeSelectorSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="w-[280px]">
        <AlertDescription className="text-xs">
          Error al cargar nodos: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  // No nodes available
  if (!nodes || nodes.length === 0) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Building2 className="h-4 w-4" />
        <span>No hay nodos disponibles</span>
      </div>
    );
  }

  // Get the display name for the current selection
  const getCurrentDisplayName = () => {
    if (currentNodeId === "all") {
      return "Todos los Nodos";
    }
    const selectedNode = nodes.find((node) => node.nodeId === currentNodeId);
    return selectedNode?.name ?? "Seleccionar nodo";
  };

  return (
    <div className="flex items-center gap-2">
      <Building2 className="text-muted-foreground hidden h-4 w-4 sm:block" />
      <Select value={currentNodeId} onValueChange={handleNodeChange}>
        <SelectTrigger className="min-h-[44px] w-[140px] sm:w-[200px]">
          <SelectValue placeholder="Seleccionar nodo">
            <span className="truncate">{getCurrentDisplayName()}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="min-h-[44px]">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>Todos los Nodos</span>
            </div>
          </SelectItem>
          {nodes.map((node) => (
            <SelectItem
              key={node.nodeId}
              value={node.nodeId}
              className="min-h-[44px]"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span>{node.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
