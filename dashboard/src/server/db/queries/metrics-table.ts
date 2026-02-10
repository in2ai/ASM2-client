import { executeQuery } from "../connection";
import {
  appendAndConditions,
  buildFilterConditions,
  parseCount,
  type QueryParam,
} from "./shared";
import type { MetricsByTag, MetricsQueryParams } from "./types";

/**
 * Get average value from metrics table for a specific tag
 */
export async function meanMetric(
  tag: string,
  params: MetricsQueryParams = {},
): Promise<number | null> {
  const baseParams: QueryParam[] = [tag];
  const { conditions, queryParams } = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
    startIndex: 2,
  });

  const query = appendAndConditions(
    "SELECT AVG(value) as avg FROM metrics WHERE tag = $1",
    conditions,
  );

  const rows = await executeQuery<{ avg: number | null }>(query, [
    ...baseParams,
    ...queryParams,
  ]);

  return rows[0]?.avg ?? null;
}

/**
 * Count total records in metrics table, optionally filtered by tag
 */
export async function countMetrics(
  params: MetricsQueryParams & { tag?: string } = {},
): Promise<number> {
  const queryParams: QueryParam[] = [];
  let query = "SELECT COUNT(*) as cnt FROM metrics WHERE 1=1";

  if (params.tag) {
    query += ` AND tag = $${queryParams.length + 1}`;
    queryParams.push(params.tag);
  }

  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
    startIndex: queryParams.length + 1,
  });

  query = appendAndConditions(query, filterData.conditions);

  const rows = await executeQuery<{ cnt: string }>(query, [
    ...queryParams,
    ...filterData.queryParams,
  ]);

  return parseCount(rows[0]?.cnt);
}

/**
 * Retrieve up to 20 metric aggregates grouped by tag, ordered by frequency.
 */
export async function getMetricsByTag(
  params: MetricsQueryParams = {},
): Promise<MetricsByTag[]> {
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
  });

  const query = `
    SELECT
      tag,
      AVG(value) as avg_value,
      COUNT(*) as cnt
    FROM metrics
    ${appendAndConditions("WHERE tag IS NOT NULL", filterData.conditions)}
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 20
  `;

  const rows = await executeQuery<{
    tag: string;
    avg_value: number;
    cnt: string;
  }>(query, filterData.queryParams);

  return rows.map((row) => ({
    tag: row.tag,
    avg_value: row.avg_value ?? 0,
    count: parseCount(row.cnt),
  }));
}
