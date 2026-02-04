import { executeQuery } from "./connection";

export interface MetricsQueryParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  userRole?: string;
  lang?: string;
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

  if (params.lang) {
    query += ` AND lang = $${paramIndex}`;
    queryParams.push(params.lang);
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

  const gapMicros = sessionGapMinutes * 60 * 1000 * 1000;
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
            SUM(CASE WHEN prev_ts IS NULL OR (ts - prev_ts) >= ${gapMicros} THEN 1 ELSE 0 END)
                OVER (PARTITION BY user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS session_id
        FROM user_events
    )
    SELECT
        AVG(session_length) / 1000000.0 AS mean_session_seconds
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
 * Return a mapping of user roles to the number of distinct users with that role from the user_activity table.
 *
 * Filters by the optional `startDate` and `endDate` in `params` when provided; rows with a null `user_role` are excluded.
 *
 * @param params - Optional query filters; recognized keys include `startDate` and `endDate` to restrict the time range (inclusive).
 * @returns A record where keys are user roles and values are the count of distinct users for that role.
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
// Time-series and aggregation queries
// =================================

export interface ActivityByDay {
  date: string;
  event_count: number;
  unique_users: number;
}

/**
 * Retrieve daily user activity for up to 30 days.
 *
 * @param params - Optional filters:
 *   - `startDate`: include events occurring at or after this timestamp
 *   - `endDate`: include events occurring at or before this timestamp
 *   - `userId`: restrict to events for the specified user
 *   - `userRole`: restrict to events for users with the specified role
 * @returns An array of ActivityByDay objects with properties:
 *   - `date`: date string for the day
 *   - `event_count`: total events on that day
 *   - `unique_users`: number of distinct users who had events that day
 *   The array is ordered from oldest to newest.
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
      to_str(ts, 'yyyy-MM-dd') as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity
    ${whereClause}
    GROUP BY to_str(ts, 'yyyy-MM-dd')
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

export interface HourlyActivity {
  hour: number;
  event_count: number;
}

/**
 * Compute activity counts for each hour of the day using optional time and user filters.
 *
 * The result always contains 24 entries (hours 0 through 23); hours with no events are included with `event_count` set to `0`.
 *
 * @param params - Optional filters: `startDate`, `endDate`, `userId`, and `userRole`
 * @returns An array of `HourlyActivity` objects for hours 0–23 where `event_count` is the number of events in that hour
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

export interface MetricsByTag {
  tag: string;
  avg_value: number;
  count: number;
}

/**
 * Retrieve up to 20 metric aggregates grouped by tag, ordered by frequency.
 *
 * @param params - Optional filters to restrict the metrics by `startDate`, `endDate`, `userId`, or `userRole`
 * @returns An array of `MetricsByTag` objects each containing `tag`, `avg_value` (average metric value, 0 if absent), and `count` (number of samples)
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

// =================================
// Response Time Trend Queries
// =================================

export interface ResponseTimeTrend {
  date: string;
  llm_response_time: number;
  doc_response_time: number;
}

/**
 * Get response time trends (LLM and DOC) aggregated by day
 */
export async function getResponseTimeTrend(
  params: MetricsQueryParams = {},
): Promise<ResponseTimeTrend[]> {
  const queryParams: (string | number)[] = [];
  let whereClause = "WHERE tag IN ('LLM_RESPONSE_TIME', 'DOC_RESPONSE_TIME')";
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

  const query = `
    SELECT 
      to_str(ts, 'yyyy-MM-dd') as date,
      AVG(CASE WHEN tag = 'LLM_RESPONSE_TIME' THEN value ELSE NULL END) as llm_response_time,
      AVG(CASE WHEN tag = 'DOC_RESPONSE_TIME' THEN value ELSE NULL END) as doc_response_time
    FROM metrics
    ${whereClause}
    GROUP BY to_str(ts, 'yyyy-MM-dd')
    ORDER BY date DESC
    LIMIT 30
  `;

  const rows = await executeQuery<{
    date: string;
    llm_response_time: number | null;
    doc_response_time: number | null;
  }>(query, queryParams);

  return rows
    .map((row) => ({
      date: row.date,
      llm_response_time: row.llm_response_time ?? 0,
      doc_response_time: row.doc_response_time ?? 0,
    }))
    .reverse();
}

// =================================
// Token Usage Queries
// =================================

export interface TokenUsageStats {
  llm_tokens_in: number;
  llm_tokens_out: number;
  rag_tokens_in: number;
  rag_tokens_out: number;
}

/**
 * Get total token usage statistics
 */
export async function getTokenUsageStats(
  params: MetricsQueryParams = {},
): Promise<TokenUsageStats> {
  const queryParams: (string | number)[] = [];
  let whereClause =
    "WHERE tag IN ('NUM_LLM_TOKENS_IN', 'NUM_LLM_TOKENS_OUT', 'NUM_RAG_TOKENS_IN', 'NUM_RAG_TOKENS_OUT')";
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

  const query = `
    SELECT 
      SUM(CASE WHEN tag = 'NUM_LLM_TOKENS_IN' THEN value ELSE 0 END) as llm_tokens_in,
      SUM(CASE WHEN tag = 'NUM_LLM_TOKENS_OUT' THEN value ELSE 0 END) as llm_tokens_out,
      SUM(CASE WHEN tag = 'NUM_RAG_TOKENS_IN' THEN value ELSE 0 END) as rag_tokens_in,
      SUM(CASE WHEN tag = 'NUM_RAG_TOKENS_OUT' THEN value ELSE 0 END) as rag_tokens_out
    FROM metrics
    ${whereClause}
  `;

  const rows = await executeQuery<{
    llm_tokens_in: number | null;
    llm_tokens_out: number | null;
    rag_tokens_in: number | null;
    rag_tokens_out: number | null;
  }>(query, queryParams);

  const row = rows[0];
  return {
    llm_tokens_in: row?.llm_tokens_in ?? 0,
    llm_tokens_out: row?.llm_tokens_out ?? 0,
    rag_tokens_in: row?.rag_tokens_in ?? 0,
    rag_tokens_out: row?.rag_tokens_out ?? 0,
  };
}

// =================================
// System Health Queries
// =================================

export interface SystemHealthStats {
  avg_cpu: number;
  avg_ram: number;
  avg_gpu: number;
  max_cpu: number;
  max_ram: number;
  max_gpu: number;
}

/**
 * Get system health statistics (CPU, RAM, GPU usage)
 */
export async function getSystemHealthStats(
  params: MetricsQueryParams = {},
): Promise<SystemHealthStats> {
  const queryParams: (string | number)[] = [];
  let whereClause = "WHERE tag IN ('CPU_USAGE', 'RAM_USAGE', 'GPU_USAGE')";
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

  const query = `
    SELECT 
      AVG(CASE WHEN tag = 'CPU_USAGE' THEN value ELSE NULL END) as avg_cpu,
      AVG(CASE WHEN tag = 'RAM_USAGE' THEN value ELSE NULL END) as avg_ram,
      AVG(CASE WHEN tag = 'GPU_USAGE' THEN value ELSE NULL END) as avg_gpu,
      MAX(CASE WHEN tag = 'CPU_USAGE' THEN value ELSE NULL END) as max_cpu,
      MAX(CASE WHEN tag = 'RAM_USAGE' THEN value ELSE NULL END) as max_ram,
      MAX(CASE WHEN tag = 'GPU_USAGE' THEN value ELSE NULL END) as max_gpu
    FROM metrics
    ${whereClause}
  `;

  const rows = await executeQuery<{
    avg_cpu: number | null;
    avg_ram: number | null;
    avg_gpu: number | null;
    max_cpu: number | null;
    max_ram: number | null;
    max_gpu: number | null;
  }>(query, queryParams);

  const row = rows[0];
  return {
    avg_cpu: row?.avg_cpu ?? 0,
    avg_ram: row?.avg_ram ?? 0,
    avg_gpu: row?.avg_gpu ?? 0,
    max_cpu: row?.max_cpu ?? 0,
    max_ram: row?.max_ram ?? 0,
    max_gpu: row?.max_gpu ?? 0,
  };
}

/**
 * Get average documents retrieved per RAG query
 */
export async function getAvgDocsPerQuery(
  params: MetricsQueryParams = {},
): Promise<number> {
  const queryParams: (string | number)[] = [];
  let whereClause = "WHERE tag = 'NUM_DOCS_RAG'";
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

  const query = `
    SELECT AVG(value) as avg_docs
    FROM metrics
    ${whereClause}
  `;

  const rows = await executeQuery<{ avg_docs: number | null }>(
    query,
    queryParams,
  );
  return rows[0]?.avg_docs ?? 0;
}
