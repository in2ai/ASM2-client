"use client";

import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/trpc/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Database,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

interface WorkOSUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}

/**
 * NodesManagementPage Component
 *
 * Displays a table of all nodes with their statistics including:
 * - Node name and ID
 * - Last metric timestamp
 * - Total metrics count
 * - Click-through navigation to node-specific dashboard
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */
export function NodesManagementPage() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const user = authUser as WorkOSUser | null;

  // Fetch all nodes
  const {
    data: nodes,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = api.metrics.listNodes.useQuery(
    { includeInactive: false },
    {
      enabled: !!user && user.role === "admin",
      staleTime: 30_000, // 30 seconds
    },
  );

  // Fetch node summaries for all nodes to get metrics count and last timestamp
  const nodeSummaries = api.useQueries((t) =>
    (nodes ?? []).map((node) =>
      t.metrics.getNodeSummary(
        { nodeId: node.nodeId },
        {
          enabled: !!nodes && nodes.length > 0,
          staleTime: 30_000,
        },
      ),
    ),
  );

  // Combine nodes with their summaries and sort by most recent activity
  const nodesWithStats = useMemo(() => {
    if (!nodes || nodeSummaries.some((q) => q.isLoading)) {
      return [];
    }

    return nodes
      .map((node, index) => {
        const summary = nodeSummaries[index]?.data;
        return {
          ...node,
          metricsCount: summary?.metricsCount ?? 0,
          lastMetricTimestamp: summary?.latestMetric?.timestamp,
        };
      })
      .sort((a, b) => {
        // Sort by most recent activity (nodes with recent metrics first)
        if (!a.lastMetricTimestamp && !b.lastMetricTimestamp) return 0;
        if (!a.lastMetricTimestamp) return 1;
        if (!b.lastMetricTimestamp) return -1;
        return (
          new Date(b.lastMetricTimestamp).getTime() -
          new Date(a.lastMetricTimestamp).getTime()
        );
      });
  }, [nodes, nodeSummaries]);

  // Format date for display
  const formatDate = (date: Date | undefined) => {
    if (!date) return "Sin datos";
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  };

  // Handle navigation to node-specific dashboard
  const handleNodeClick = (nodeId: string) => {
    router.push(`/?nodeId=${nodeId}`);
  };

  // Check if all summaries are still loading
  const isSummariesLoading = nodeSummaries.some((q) => q.isLoading);

  return (
    <div className="bg-muted/10 min-h-screen">
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Volver al Dashboard</span>
                  <span className="sm:hidden">Volver</span>
                </Button>
              </Link>
            </div>
            <h1 className="text-2xl font-bold sm:text-3xl">Gestión de Nodos</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Vista general de todos los nodos y sus métricas
            </p>
          </div>
          <Button
            onClick={() => {
              void refetch();
            }}
            disabled={isRefetching || isLoading}
            size="sm"
            variant="outline"
            className="min-h-[44px] gap-2 self-start sm:self-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching || isLoading ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">
              {isRefetching || isLoading ? "Actualizando..." : "Actualizar"}
            </span>
            <span className="sm:hidden">
              {isRefetching || isLoading ? "..." : "↻"}
            </span>
          </Button>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          /* Error State */
          <ErrorState
            title="Error al cargar nodos"
            message={
              error instanceof Error
                ? error.message
                : "No se pudieron cargar los nodos. Por favor, intenta nuevamente."
            }
            onRetry={() => {
              void refetch();
            }}
            isRetrying={isRefetching}
            showHomeButton={true}
          />
        ) : !nodes || nodes.length === 0 ? (
          /* Empty State */
          <EmptyState />
        ) : (
          /* Nodes Table */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Nodos Activos
              </CardTitle>
              <CardDescription>
                {nodes.length} nodo{nodes.length !== 1 ? "s" : ""} disponible
                {nodes.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre del Nodo</TableHead>
                    <TableHead className="hidden md:table-cell">
                      ID del Nodo
                    </TableHead>
                    <TableHead className="hidden text-right lg:table-cell">
                      Última Métrica
                    </TableHead>
                    <TableHead className="text-right">
                      Total de Métricas
                    </TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Estado
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isSummariesLoading
                    ? /* Loading rows while fetching summaries */
                      nodes.map((node) => (
                        <TableRow key={node.nodeId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
                              <span className="font-medium">{node.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <code className="text-muted-foreground bg-muted rounded px-2 py-1 text-xs">
                              {node.nodeId}
                            </code>
                          </TableCell>
                          <TableCell className="hidden text-right lg:table-cell">
                            <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                          </TableCell>
                          <TableCell className="hidden text-right sm:table-cell">
                            <Badge variant="secondary">Activo</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleNodeClick(node.nodeId)}
                              className="h-8 min-h-[44px] w-8 min-w-[44px] p-0"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    : /* Loaded rows with data */
                      nodesWithStats.map((node) => (
                        <TableRow
                          key={node.nodeId}
                          className="hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => handleNodeClick(node.nodeId)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
                              <span className="font-medium">{node.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <code className="text-muted-foreground bg-muted rounded px-2 py-1 text-xs">
                              {node.nodeId}
                            </code>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden text-right text-sm lg:table-cell">
                            {formatDate(node.lastMetricTimestamp)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Database className="text-muted-foreground h-4 w-4 shrink-0" />
                              <span className="font-medium">
                                {node.metricsCount.toLocaleString("es-ES")}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-right sm:table-cell">
                            <Badge
                              variant={node.isActive ? "secondary" : "outline"}
                            >
                              {node.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNodeClick(node.nodeId);
                              }}
                              className="h-8 min-h-[44px] w-8 min-w-[44px] p-0"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * LoadingState Component
 *
 * Displays a skeleton loading state while nodes data is being fetched
 */
function LoadingState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Nodos Activos
        </CardTitle>
        <CardDescription>Cargando nodos...</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre del Nodo</TableHead>
              <TableHead className="hidden md:table-cell">
                ID del Nodo
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                Última Métrica
              </TableHead>
              <TableHead className="text-right">Total de Métricas</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Estado
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                    <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="bg-muted h-6 w-24 animate-pulse rounded" />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="bg-muted ml-auto h-4 w-32 animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted ml-auto h-4 w-16 animate-pulse rounded" />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="bg-muted ml-auto h-6 w-16 animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="bg-muted h-8 w-8 animate-pulse rounded" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * EmptyState Component
 *
 * Displays when no nodes are available in the system
 */
function EmptyState() {
  return (
    <Card>
      <CardContent className="flex min-h-[400px] flex-col items-center justify-center p-8">
        <Building2 className="text-muted-foreground mb-4 h-16 w-16" />
        <h3 className="mb-2 text-xl font-semibold">No hay nodos disponibles</h3>
        <p className="text-muted-foreground mb-6 text-center text-sm">
          No se encontraron nodos en el sistema. Los nodos se crean
          automáticamente cuando se registran métricas.
        </p>
        <Link href="/">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
