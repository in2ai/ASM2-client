import { executeQuery } from "./connection";

export interface MetricsQueryParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  userRole?: string;
}

// =================================
// Queries for metrics table
// =================================

/**
 * Get average value from metrics table for a specific tag
 */
export async function meanMetric(
  tag: string,
  params: MetricsQueryParams = {},
): Promise<number | null> {
  const queryParams: (string | number)[] = [tag];
  let query = "SELECT AVG(value) as avg FROM metrics WHERE tag = $1";
  let paramIndex = 2;

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    query += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    query += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const rows = await executeQuery<{ avg: number | null }>(query, queryParams);
  const avg = rows[0]?.avg;

  return avg ?? null;
}

/**
 * Count total records in metrics table, optionally filtered by tag
 */
export async function countMetrics(
  params: MetricsQueryParams & { tag?: string } = {},
): Promise<number> {
  const queryParams: (string | number)[] = [];
  let query = "SELECT COUNT(*) as cnt FROM metrics WHERE 1=1";
  let paramIndex = 1;

  if (params.tag) {
    query += ` AND tag = $${paramIndex}`;
    queryParams.push(params.tag);
    paramIndex++;
  }

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    query += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    query += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const rows = await executeQuery<{ cnt: string }>(query, queryParams);

  if (!rows.length) {
    return 0;
  }

  return Number.parseInt(rows[0]?.cnt ?? "0", 10);
}

// =================================
// Queries for word_counts table
// =================================

export interface SearchTerm {
  word: string;
  count: number;
}

/**
 * Get top k words from word_counts table
 */
export async function topKSearchTerms(
  k = 10,
  params: MetricsQueryParams = {},
): Promise<SearchTerm[]> {
  const queryParams: (string | number)[] = [];
  let query = "SELECT word, COUNT(*) as cnt FROM word_counts WHERE 1=1";
  let paramIndex = 1;

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    query += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    query += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  query += ` GROUP BY word ORDER BY cnt DESC LIMIT $${paramIndex}`;
  queryParams.push(k);

  const rows = await executeQuery<{ word: string; cnt: string }>(
    query,
    queryParams,
  );

  return rows.map((row) => ({
    word: row.word,
    count: Number.parseInt(row.cnt, 10),
  }));
}

// =================================
// Queries for topic_counts table
// =================================

export interface TopicCount {
  topic: string;
  count: number;
}

/**
 * Get top k topics from topic_counts table
 */
export async function topKTopics(
  k = 10,
  params: MetricsQueryParams = {},
): Promise<TopicCount[]> {
  const queryParams: (string | number)[] = [];
  let query = "SELECT word, COUNT(*) as cnt FROM topic_counts WHERE 1=1";
  let paramIndex = 1;

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    query += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    query += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  query += ` GROUP BY word ORDER BY cnt DESC LIMIT $${paramIndex}`;
  queryParams.push(k);

  const rows = await executeQuery<{ word: string; cnt: string }>(
    query,
    queryParams,
  );

  return rows.map((row) => ({
    topic: row.word,
    count: Number.parseInt(row.cnt, 10),
  }));
}

// =================================
// Queries for user_activity table
// =================================

/**
 * Calculate mean session length from user_activity table
 * @param sessionGapMinutes Gap in minutes to consider a new session (default: 10)
 */
export async function meanSessionLength(
  sessionGapMinutes = 10,
  params: MetricsQueryParams = {},
): Promise<number | null> {
  if (sessionGapMinutes <= 0) {
    throw new Error("sessionGapMinutes must be > 0");
  }

  const gapMs = sessionGapMinutes * 60 * 1000;
  const queryParams: (string | number)[] = [];
  const whereClauses: string[] = [];
  let paramIndex = 1;

  if (params.startDate) {
    whereClauses.push(`ts >= $${paramIndex}`);
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    whereClauses.push(`ts <= $${paramIndex}`);
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    whereClauses.push(`user_id = $${paramIndex}`);
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    whereClauses.push(`user_role = $${paramIndex}`);
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const timeFilter =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const query = `
    WITH user_events AS (
        SELECT
            user_id,
            ts,
            LAG(ts) OVER (PARTITION BY user_id ORDER BY ts) AS prev_ts
        FROM user_activity
        ${timeFilter}
    ),
    sessions AS (
        SELECT
            user_id,
            ts,
            SUM(CASE WHEN prev_ts IS NULL OR (ts - prev_ts) >= ${gapMs} THEN 1 ELSE 0 END)
                OVER (PARTITION BY user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
        FROM user_events
    )
    SELECT
        AVG(session_length) / 1000.0 AS mean_session_seconds
    FROM (
        SELECT
            user_id,
            session_id,
            MAX(ts) - MIN(ts) AS session_length
        FROM sessions
        GROUP BY user_id, session_id
    ) t
  `;

  const rows = await executeQuery<{ mean_session_seconds: number | null }>(
    query,
    queryParams,
  );
  const meanSeconds = rows[0]?.mean_session_seconds;

  return meanSeconds ?? null;
}

/**
 * Get count of unique users from user_activity table
 */
export async function getUniqueUsers(
  params: MetricsQueryParams = {},
): Promise<number> {
  const queryParams: (string | number)[] = [];
  let query =
    "SELECT COUNT(DISTINCT user_id) as cnt FROM user_activity WHERE 1=1";
  let paramIndex = 1;

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userRole) {
    query += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const rows = await executeQuery<{ cnt: string }>(query, queryParams);

  if (!rows.length) {
    return 0;
  }

  return Number.parseInt(rows[0]?.cnt ?? "0", 10);
}

/**
 * Get total event count from user_activity table
 */
export async function getTotalActivityEvents(
  params: MetricsQueryParams = {},
): Promise<number> {
  const queryParams: (string | number)[] = [];
  let query = "SELECT COUNT(*) as cnt FROM user_activity WHERE 1=1";
  let paramIndex = 1;

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    query += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    query += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const rows = await executeQuery<{ cnt: string }>(query, queryParams);

  if (!rows.length) {
    return 0;
  }

  return Number.parseInt(rows[0]?.cnt ?? "0", 10);
}

/**
 * Get distribution of users by role from user_activity table
 */
export async function getUserRoleDistribution(
  params: MetricsQueryParams = {},
): Promise<Record<string, number>> {
  const queryParams: (string | number)[] = [];
  let query = `
    SELECT user_role, COUNT(DISTINCT user_id) as cnt 
    FROM user_activity 
    WHERE user_role IS NOT NULL
  `;
  let paramIndex = 1;

  if (params.startDate) {
    query += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    query += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  query += " GROUP BY user_role ORDER BY cnt DESC";

  const rows = await executeQuery<{ user_role: string; cnt: string }>(
    query,
    queryParams,
  );

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.user_role] = Number.parseInt(row.cnt, 10);
  }

  return result;
}

// =================================
// Queries for requests table
// =================================

export interface RequestStats {
  total_requests: number;
  avg_latency: number | null;
  status_breakdown: Record<number, number>;
  endpoint_breakdown: Record<string, number>;
  method_breakdown: Record<string, number>;
}

/**
 * Get request statistics from requests table
 */
export async function getRequestStats(
  params: MetricsQueryParams = {},
): Promise<RequestStats> {
  const queryParams: (string | number)[] = [];
  let whereClause = "WHERE 1=1";
  let paramIndex = 1;

  if (params.startDate) {
    whereClause += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    whereClause += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    whereClause += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    whereClause += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const mainQuery = `
    SELECT 
      COUNT(*) as total_requests,
      AVG(latency) as avg_latency
    FROM requests
    ${whereClause}
  `;
  const mainRows = await executeQuery<{
    total_requests: string;
    avg_latency: number | null;
  }>(mainQuery, queryParams);

  let totalRequests = 0;
  let avgLatency: number | null = null;

  if (mainRows.length && mainRows[0]) {
    totalRequests = Number.parseInt(mainRows[0].total_requests ?? "0", 10);
    avgLatency = mainRows[0].avg_latency;
  }

  const statusQuery = `
    SELECT status, COUNT(*) as cnt
    FROM requests
    ${whereClause}
    GROUP BY status
    ORDER BY cnt DESC
  `;
  const statusRows = await executeQuery<{ status: number; cnt: string }>(
    statusQuery,
    queryParams,
  );
  const statusBreakdown: Record<number, number> = {};
  for (const row of statusRows) {
    statusBreakdown[row.status] = Number.parseInt(row.cnt, 10);
  }

  const endpointQuery = `
    SELECT endpoint, COUNT(*) as cnt
    FROM requests
    ${whereClause}
    GROUP BY endpoint
    ORDER BY cnt DESC
    LIMIT 20
  `;
  const endpointRows = await executeQuery<{ endpoint: string; cnt: string }>(
    endpointQuery,
    queryParams,
  );
  const endpointBreakdown: Record<string, number> = {};
  for (const row of endpointRows) {
    endpointBreakdown[row.endpoint] = Number.parseInt(row.cnt, 10);
  }

  const methodQuery = `
    SELECT method, COUNT(*) as cnt
    FROM requests
    ${whereClause}
    GROUP BY method
    ORDER BY cnt DESC
  `;
  const methodRows = await executeQuery<{ method: string; cnt: string }>(
    methodQuery,
    queryParams,
  );
  const methodBreakdown: Record<string, number> = {};
  for (const row of methodRows) {
    methodBreakdown[row.method] = Number.parseInt(row.cnt, 10);
  }

  return {
    total_requests: totalRequests,
    avg_latency: avgLatency,
    status_breakdown: statusBreakdown,
    endpoint_breakdown: endpointBreakdown,
    method_breakdown: methodBreakdown,
  };
}

/**
 * Calculate error rate (4xx + 5xx responses) from requests table
 */
export async function getErrorRate(
  params: MetricsQueryParams = {},
): Promise<number> {
  const queryParams: (string | number)[] = [];
  let whereClause = "WHERE 1=1";
  let paramIndex = 1;

  if (params.startDate) {
    whereClause += ` AND ts >= $${paramIndex}`;
    queryParams.push(params.startDate);
    paramIndex++;
  }

  if (params.endDate) {
    whereClause += ` AND ts <= $${paramIndex}`;
    queryParams.push(params.endDate);
    paramIndex++;
  }

  if (params.userId) {
    whereClause += ` AND user_id = $${paramIndex}`;
    queryParams.push(params.userId);
    paramIndex++;
  }

  if (params.userRole) {
    whereClause += ` AND user_role = $${paramIndex}`;
    queryParams.push(params.userRole);
    paramIndex++;
  }

  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as errors
    FROM requests
    ${whereClause}
  `;

  const rows = await executeQuery<{
    total: string;
    errors: string | null;
  }>(query, queryParams);

  if (!rows.length || !rows[0]) {
    return 0;
  }

  const total = Number.parseInt(rows[0].total ?? "0", 10);
  const errors = Number.parseInt(rows[0].errors ?? "0", 10);

  if (total === 0) {
    return 0;
  }

  return (errors / total) * 100;
}
