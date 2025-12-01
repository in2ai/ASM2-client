import { connectDB } from "@/lib/db";
import { NodeNotFoundError } from "@/lib/errors";
import { RAGMetric } from "@/models/metric";
import { Node } from "@/models/node";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Zod input schema for metrics queries with nodeId parameter
const metricsQuerySchema = z.object({
  nodeId: z.string().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
  skip: z.number().min(0).default(0), // Pagination support
});

// Zod input schema for node list queries
const nodeListSchema = z.object({
  includeInactive: z.boolean().default(false),
});

// Zod input schema for node summary queries
const nodeSummarySchema = z.object({
  nodeId: z.string(),
});

// Type for aggregated statistics result from MongoDB
interface AggregatedStats {
  _id: null;
  avgResponseTime: number;
  totalQueries: number;
  avgDailyUsers: number;
  avgWeeklyUsers: number;
  avgMonthlyUsers: number;
  avgRetrievalLatency: number;
  avgSuccessfulRetrievalRate: number;
  avgCostPerQuery: number;
  totalErrors: number;
  documentCount: number;
}

// Type for $facet aggregation result in get query
interface FacetResult {
  filteredData: Array<{
    _id: unknown;
    usage_metrics: {
      unique_users: {
        daily: number;
        weekly: number;
        monthly: number;
      };
      active_sessions: {
        daily: number;
        weekly: number;
        monthly: number;
      };
      processed_queries: {
        total: number;
        daily_average: number;
      };
      session_duration: {
        average_minutes: number;
        median_minutes: number;
      };
      department_distribution: {
        hr: number;
        it: number;
        legal: number;
        finance: number;
        other: number;
      };
    };
    rag_quality_metrics: {
      successful_retrieval_rate: number;
      retrieval_latency_ms: number;
      empty_response_rate: number;
      average_context_tokens: number;
    };
    performance_metrics: {
      average_response_time_ms: number;
      token_usage: {
        average_prompt: number;
        average_completion: number;
        average_total: number;
      };
      resource_consumption: {
        cpu_percent: number;
        memory_mb: number;
        connection_latency_ms: number;
      };
      cost_per_query: number;
      errors: {
        timeout: number;
        retrieval_failure: number;
        model_call_failure: number;
        other: number;
      };
    };
    extra_analytics: {
      top_queries: string[];
      common_words: string[];
      thematic_distribution: {
        hr: number;
        it: number;
        legal: number;
        finance: number;
        other: number;
      };
    };
    alerts: {
      latency_alert: number;
      error_rate_alert: number;
      status: string;
    };
    timestamp: Date;
    nodeId: string;
  }>;
  totalExists: Array<{ count: number }>;
}

export const metricsRouter = createTRPCRouter({
  /**
   * Get metrics with performance optimizations:
   * - Uses $facet aggregation for efficient queries (Requirement 13.1)
   * - Implements field projection to limit data transfer (Requirement 13.4)
   * - Supports pagination with skip/limit (Requirement 13.4)
   * - Uses database indexes for efficient filtering (Requirement 13.3)
   * - Checks totalExists in single query to avoid multiple DB calls
   */
  get: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        await connectDB();

        // Build query filter
        const filter: Record<string, unknown> = {};

        // End users can only see their own node
        // Administrators can specify a node or view all nodes
        if (ctx.userContext.role === "user") {
          filter.nodeId = ctx.userContext.organizationId;
        } else if (input.nodeId) {
          // Admin specified a node
          filter.nodeId = input.nodeId;
        }
        // Admin without nodeId = all nodes

        // Add date range filtering support
        if (input.startDate || input.endDate) {
          filter.timestamp = {};
          if (input.startDate) {
            (filter.timestamp as Record<string, Date>).$gte = input.startDate;
          }
          if (input.endDate) {
            (filter.timestamp as Record<string, Date>).$lte = input.endDate;
          }
        }

        // Single aggregation that does everything
        const [result] = await RAGMetric.aggregate<FacetResult>([
          {
            $facet: {
              // 1. Get filtered data with pagination
              filteredData: [
                { $match: filter },
                { $sort: { timestamp: -1 } },
                { $skip: input.skip },
                { $limit: input.limit },
                // Only return needed fields
                {
                  $project: {
                    usage_metrics: 1,
                    rag_quality_metrics: 1,
                    performance_metrics: 1,
                    extra_analytics: 1,
                    alerts: 1,
                    timestamp: 1,
                    nodeId: 1,
                  },
                },
              ],
              // 2. Check if ANY data exists in collection
              totalExists: [{ $limit: 1 }, { $count: "count" }],
            },
          },
        ]);

        const metrics = result?.filteredData ?? [];
        const totalExists = (result?.totalExists?.[0]?.count ?? 0) > 0;

        if (metrics.length === 0) {
          // Check if data exists but outside the date range
          const hasDateFilter = input.startDate ?? input.endDate;

          if (hasDateFilter && totalExists) {
            // Data exists in the collection but not in the specified date range
            throw new TRPCError({
              code: "NOT_FOUND",
              message:
                "No metrics data found in the specified date range. Try adjusting your date filters.",
            });
          }

          // No data exists at all - check node configuration
          if (ctx.userContext.role === "user") {
            const nodeExists = await Node.exists({
              nodeId: ctx.userContext.organizationId,
            });

            if (nodeExists) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "No metrics data available for your organization yet",
              });
            } else {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Your organization is not configured in the system",
              });
            }
          }

          // For admins with a specific nodeId filter
          if (input.nodeId) {
            const nodeExists = await Node.exists({ nodeId: input.nodeId });

            if (nodeExists) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `No metrics data available for node ${input.nodeId}`,
              });
            } else {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: `Node with ID ${input.nodeId} not found`,
              });
            }
          }

          // For admins viewing all nodes
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No metrics data found. Please run the seed script to generate sample data.",
          });
        }

        // Return the latest metric with all data
        const latestMetric = metrics[0]!;

        return {
          usage_metrics: latestMetric.usage_metrics,
          rag_quality_metrics: latestMetric.rag_quality_metrics,
          performance_metrics: latestMetric.performance_metrics,
          extra_analytics: latestMetric.extra_analytics,
          alerts: latestMetric.alerts,
          metadata: {
            updatedAt: latestMetric.timestamp.toISOString(),
            documentId: String(latestMetric._id),
            nodeId: latestMetric.nodeId,
            totalRecords: metrics.length,
            totalExists,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch metrics from database",
          cause: error,
        });
      }
    }),

  /**
   * Get aggregated statistics with performance optimizations:
   * - Uses MongoDB aggregation pipelines for server-side computation (Requirement 13.3, 13.5)
   * - Processes data at database level instead of client-side
   * - Leverages indexes for efficient filtering
   */
  getStats: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        await connectDB();

        // Build match stage for aggregation
        const matchStage: Record<string, unknown> = {};

        // Apply role-based filtering
        // End users can only see their own node
        if (ctx.userContext.role === "user") {
          matchStage.nodeId = ctx.userContext.organizationId;
        } else if (input.nodeId) {
          // Admin specified a node
          matchStage.nodeId = input.nodeId;
        }
        // Admin without nodeId = all nodes

        // Add date range filtering
        if (input.startDate || input.endDate) {
          matchStage.timestamp = {};
          if (input.startDate) {
            (matchStage.timestamp as Record<string, Date>).$gte =
              input.startDate;
          }
          if (input.endDate) {
            (matchStage.timestamp as Record<string, Date>).$lte = input.endDate;
          }
        }

        // Perform MongoDB aggregation to calculate statistics
        const stats = await RAGMetric.aggregate<AggregatedStats>([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              // Average response time
              avgResponseTime: {
                $avg: "$performance_metrics.average_response_time_ms",
              },
              // Total queries
              totalQueries: {
                $sum: "$usage_metrics.processed_queries.total",
              },
              // User counts
              avgDailyUsers: {
                $avg: "$usage_metrics.unique_users.daily",
              },
              avgWeeklyUsers: {
                $avg: "$usage_metrics.unique_users.weekly",
              },
              avgMonthlyUsers: {
                $avg: "$usage_metrics.unique_users.monthly",
              },
              // Additional useful statistics
              avgRetrievalLatency: {
                $avg: "$rag_quality_metrics.retrieval_latency_ms",
              },
              avgSuccessfulRetrievalRate: {
                $avg: "$rag_quality_metrics.successful_retrieval_rate",
              },
              avgCostPerQuery: {
                $avg: "$performance_metrics.cost_per_query",
              },
              totalErrors: {
                $sum: {
                  $add: [
                    "$performance_metrics.errors.timeout",
                    "$performance_metrics.errors.retrieval_failure",
                    "$performance_metrics.errors.model_call_failure",
                    "$performance_metrics.errors.other",
                  ],
                },
              },
              // Count of documents in the aggregation
              documentCount: { $sum: 1 },
            },
          },
        ]).exec();

        // Return null for empty datasets with appropriate messaging
        if (!stats || stats.length === 0) {
          return null;
        }

        const result = stats[0]!;

        return {
          avgResponseTime: result.avgResponseTime ?? 0,
          totalQueries: result.totalQueries ?? 0,
          avgDailyUsers: result.avgDailyUsers ?? 0,
          avgWeeklyUsers: result.avgWeeklyUsers ?? 0,
          avgMonthlyUsers: result.avgMonthlyUsers ?? 0,
          avgRetrievalLatency: result.avgRetrievalLatency ?? 0,
          avgSuccessfulRetrievalRate: result.avgSuccessfulRetrievalRate ?? 0,
          avgCostPerQuery: result.avgCostPerQuery ?? 0,
          totalErrors: result.totalErrors ?? 0,
          documentCount: result.documentCount ?? 0,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to calculate aggregated statistics",
          cause: error,
        });
      }
    }),

  // List all nodes (admin only)
  listNodes: adminProcedure.input(nodeListSchema).query(async ({ input }) => {
    try {
      await connectDB();

      // Build filter for active/inactive nodes
      const filter = input.includeInactive ? {} : { isActive: true };

      // Fetch nodes sorted by name
      const nodes = await Node.find(filter).sort({ name: 1 }).lean().exec();

      return nodes;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch nodes from database",
        cause: error,
      });
    }
  }),

  // Get node details with latest metrics (admin only)
  getNodeSummary: adminProcedure
    .input(nodeSummarySchema)
    .query(async ({ input }) => {
      try {
        await connectDB();

        // Fetch the node details
        const node = await Node.findOne({ nodeId: input.nodeId }).lean().exec();

        if (!node) {
          // Throw NodeNotFoundError directly with helpful message
          throw new NodeNotFoundError(input.nodeId);
        }

        // Fetch the latest metric for this node with projection
        const latestMetric = await RAGMetric.findOne({ nodeId: input.nodeId })
          .sort({ timestamp: -1 })
          .select({
            timestamp: 1,
            usage_metrics: 1,
            rag_quality_metrics: 1,
            performance_metrics: 1,
          })
          .lean()
          .exec();

        // Count total metrics documents for this node
        const metricsCount = await RAGMetric.countDocuments({
          nodeId: input.nodeId,
        }).exec();

        return {
          node,
          latestMetric: latestMetric
            ? {
                timestamp: latestMetric.timestamp,
                usage_metrics: latestMetric.usage_metrics,
                rag_quality_metrics: latestMetric.rag_quality_metrics,
                performance_metrics: latestMetric.performance_metrics,
              }
            : null,
          metricsCount,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof NodeNotFoundError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error.message,
            cause: error,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch node summary from database",
          cause: error,
        });
      }
    }),

  // Export metrics data to CSV (respects authorization rules)
  exportMetrics: protectedProcedure
    .input(metricsQuerySchema)
    .query(async ({ ctx, input }) => {
      try {
        await connectDB();

        // Build query filter with same authorization logic as get endpoint
        const filter: Record<string, unknown> = {};

        // End users can only export their own node data
        if (ctx.userContext.role === "user") {
          filter.nodeId = ctx.userContext.organizationId;
        } else if (input.nodeId) {
          // Admin specified a node
          filter.nodeId = input.nodeId;
        }
        // Admin without nodeId = all nodes

        // Add date range filtering
        if (input.startDate || input.endDate) {
          filter.timestamp = {};
          if (input.startDate) {
            (filter.timestamp as Record<string, Date>).$gte = input.startDate;
          }
          if (input.endDate) {
            (filter.timestamp as Record<string, Date>).$lte = input.endDate;
          }
        }

        // Limit exports to 10,000 rows to prevent performance issues
        // Use projection to only fetch necessary fields for export
        const metrics = await RAGMetric.find(filter)
          .sort({ timestamp: -1 })
          .limit(10000)
          .select({
            usage_metrics: 1,
            rag_quality_metrics: 1,
            performance_metrics: 1,
            timestamp: 1,
            nodeId: 1,
          })
          .lean()
          .exec();

        if (metrics.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No metrics data found for export with the selected filters.",
          });
        }

        // Get node name for filename (if single node)
        let nodeName = "all-nodes";
        if (filter.nodeId) {
          const node = await Node.findOne({ nodeId: filter.nodeId as string })
            .lean()
            .exec();
          nodeName =
            node?.name.replaceAll(/\s+/g, "-").toLowerCase() ??
            (filter.nodeId as string);
        }

        // Return metrics data with metadata for CSV generation
        return {
          metrics,
          metadata: {
            nodeName,
            nodeId: filter.nodeId as string | undefined,
            startDate: input.startDate?.toISOString(),
            endDate: input.endDate?.toISOString(),
            exportTimestamp: new Date().toISOString(),
            totalRecords: metrics.length,
          },
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to export metrics data",
          cause: error,
        });
      }
    }),
});
