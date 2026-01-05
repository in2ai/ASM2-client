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

// =================================
// Time-series and aggregation queries
// =================================

export interface ActivityByDay {
  date: string;
  event_count: number;
  unique_users: number;
}

/**
 * Get user activity aggregated by day
 */
export async function getActivityByDay(
  params: MetricsQueryParams = {},
): Promise<ActivityByDay[]> {
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
      CAST(ts AS DATE) as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity
    ${whereClause}
    GROUP BY CAST(ts AS DATE)
    ORDER BY date DESC
    LIMIT 30
  `;

  const rows = await executeQuery<{
    date: string;
    event_count: string;
    unique_users: string;
  }>(query, queryParams);

  return rows
    .map((row) => ({
      date: row.date,
      event_count: Number.parseInt(row.event_count, 10),
      unique_users: Number.parseInt(row.unique_users, 10),
    }))
    .reverse();
}

export interface RequestsByDay {
  date: string;
  request_count: number;
  avg_latency: number;
  error_count: number;
}

/**
 * Get requests aggregated by day
 */
export async function getRequestsByDay(
  params: MetricsQueryParams = {},
): Promise<RequestsByDay[]> {
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
      CAST(ts AS DATE) as date,
      COUNT(*) as request_count,
      AVG(latency) as avg_latency,
      SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as error_count
    FROM requests
    ${whereClause}
    GROUP BY CAST(ts AS DATE)
    ORDER BY date DESC
    LIMIT 30
  `;

  const rows = await executeQuery<{
    date: string;
    request_count: string;
    avg_latency: number | null;
    error_count: string;
  }>(query, queryParams);

  return rows
    .map((row) => ({
      date: row.date,
      request_count: Number.parseInt(row.request_count, 10),
      avg_latency: row.avg_latency ?? 0,
      error_count: Number.parseInt(row.error_count, 10),
    }))
    .reverse();
}

export interface HourlyActivity {
  hour: number;
  event_count: number;
}

/**
 * Get activity distribution by hour of day
 */
export async function getHourlyActivityPattern(
  params: MetricsQueryParams = {},
): Promise<HourlyActivity[]> {
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
      EXTRACT(HOUR FROM ts) as hour,
      COUNT(*) as event_count
    FROM user_activity
    ${whereClause}
    GROUP BY EXTRACT(HOUR FROM ts)
    ORDER BY hour
  `;

  const rows = await executeQuery<{
    hour: number;
    event_count: string;
  }>(query, queryParams);

  // Fill missing hours with 0
  const hourlyMap = new Map<number, number>();
  for (const row of rows) {
    hourlyMap.set(row.hour, Number.parseInt(row.event_count, 10));
  }

  const result: HourlyActivity[] = [];
  for (let h = 0; h < 24; h++) {
    result.push({
      hour: h,
      event_count: hourlyMap.get(h) ?? 0,
    });
  }

  return result;
}

export interface LatencyDistribution {
  range: string;
  count: number;
}

/**
 * Get latency distribution in ranges
 */
export async function getLatencyDistribution(
  params: MetricsQueryParams = {},
): Promise<LatencyDistribution[]> {
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
      CASE 
        WHEN latency < 100 THEN '0-100ms'
        WHEN latency < 250 THEN '100-250ms'
        WHEN latency < 500 THEN '250-500ms'
        WHEN latency < 1000 THEN '500ms-1s'
        WHEN latency < 2000 THEN '1-2s'
        ELSE '>2s'
      END as range,
      COUNT(*) as cnt
    FROM requests
    ${whereClause}
    GROUP BY 
      CASE 
        WHEN latency < 100 THEN '0-100ms'
        WHEN latency < 250 THEN '100-250ms'
        WHEN latency < 500 THEN '250-500ms'
        WHEN latency < 1000 THEN '500ms-1s'
        WHEN latency < 2000 THEN '1-2s'
        ELSE '>2s'
      END
  `;

  const rows = await executeQuery<{
    range: string;
    cnt: string;
  }>(query, queryParams);

  // Define the order of ranges
  const rangeOrder = [
    "0-100ms",
    "100-250ms",
    "250-500ms",
    "500ms-1s",
    "1-2s",
    ">2s",
  ];
  const rangeMap = new Map<string, number>();

  for (const row of rows) {
    rangeMap.set(row.range, Number.parseInt(row.cnt, 10));
  }

  return rangeOrder.map((range) => ({
    range,
    count: rangeMap.get(range) ?? 0,
  }));
}

export interface EndpointLatency {
  endpoint: string;
  avg_latency: number;
  request_count: number;
}

/**
 * Get average latency by endpoint
 */
export async function getLatencyByEndpoint(
  params: MetricsQueryParams = {},
  limit = 10,
): Promise<EndpointLatency[]> {
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

  queryParams.push(limit);

  const query = `
    SELECT 
      endpoint,
      AVG(latency) as avg_latency,
      COUNT(*) as request_count
    FROM requests
    ${whereClause}
    GROUP BY endpoint
    ORDER BY avg_latency DESC
    LIMIT $${paramIndex}
  `;

  const rows = await executeQuery<{
    endpoint: string;
    avg_latency: number;
    request_count: string;
  }>(query, queryParams);

  return rows.map((row) => ({
    endpoint: row.endpoint,
    avg_latency: row.avg_latency ?? 0,
    request_count: Number.parseInt(row.request_count, 10),
  }));
}

export interface EndpointErrorRate {
  endpoint: string;
  total_requests: number;
  error_count: number;
  error_rate: number;
}

/**
 * Get error rate by endpoint
 */
export async function getErrorRateByEndpoint(
  params: MetricsQueryParams = {},
  limit = 10,
): Promise<EndpointErrorRate[]> {
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

  queryParams.push(limit);

  const query = `
    SELECT endpoint, total_requests, error_count FROM (
      SELECT 
        endpoint,
        COUNT(*) as total_requests,
        SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as error_count
      FROM requests
      ${whereClause}
      GROUP BY endpoint
    )
    WHERE error_count > 0
    ORDER BY error_count DESC
    LIMIT $${paramIndex}
  `;

  const rows = await executeQuery<{
    endpoint: string;
    total_requests: string;
    error_count: string;
  }>(query, queryParams);

  return rows.map((row) => {
    const total = Number.parseInt(row.total_requests, 10);
    const errors = Number.parseInt(row.error_count, 10);
    return {
      endpoint: row.endpoint,
      total_requests: total,
      error_count: errors,
      error_rate: total > 0 ? (errors / total) * 100 : 0,
    };
  });
}

export interface StatusCodeDetail {
  status: number;
  count: number;
}

/**
 * Get detailed status code breakdown
 */
export async function getDetailedStatusCodes(
  params: MetricsQueryParams = {},
): Promise<StatusCodeDetail[]> {
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
      status,
      COUNT(*) as cnt
    FROM requests
    ${whereClause}
    GROUP BY status
    ORDER BY status
  `;

  const rows = await executeQuery<{
    status: number;
    cnt: string;
  }>(query, queryParams);

  return rows.map((row) => ({
    status: row.status,
    count: Number.parseInt(row.cnt, 10),
  }));
}

export interface MetricsByTag {
  tag: string;
  avg_value: number;
  count: number;
}

/**
 * Get metrics aggregated by tag
 */
export async function getMetricsByTag(
  params: MetricsQueryParams = {},
): Promise<MetricsByTag[]> {
  const queryParams: (string | number)[] = [];
  let whereClause = "WHERE tag IS NOT NULL";
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
      tag,
      AVG(value) as avg_value,
      COUNT(*) as cnt
    FROM metrics
    ${whereClause}
    GROUP BY tag
    ORDER BY cnt DESC
    LIMIT 20
  `;

  const rows = await executeQuery<{
    tag: string;
    avg_value: number;
    cnt: string;
  }>(query, queryParams);

  return rows.map((row) => ({
    tag: row.tag,
    avg_value: row.avg_value ?? 0,
    count: Number.parseInt(row.cnt, 10),
  }));
}
