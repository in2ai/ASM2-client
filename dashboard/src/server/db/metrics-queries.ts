import { executeQuery } from "./connection";

export interface MetricsQueryParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
  userRole?: string;
  lang?: string;
}

type QueryParam = string | number;

interface FilterOptions {
  includeUserId?: boolean;
  includeUserRole?: boolean;
  includeLang?: boolean;
  startIndex?: number;
}

function buildFilterConditions(
  params: MetricsQueryParams,
  {
    includeUserId = false,
    includeUserRole = false,
    includeLang = false,
    startIndex = 1,
  }: FilterOptions = {},
): { conditions: string[]; queryParams: QueryParam[] } {
  const conditions: string[] = [];
  const queryParams: QueryParam[] = [];
  let paramIndex = startIndex;

  const addCondition = (
    column: string,
    operator: ">=" | "<=" | "=",
    value: string | undefined,
  ) => {
    if (!value) {
      return;
    }

    conditions.push(`${column} ${operator} $${paramIndex}`);
    queryParams.push(value);
    paramIndex += 1;
  };

  addCondition("ts", ">=", params.startDate);
  addCondition("ts", "<=", params.endDate);

  if (includeUserId) {
    addCondition("user_id", "=", params.userId);
  }

  if (includeUserRole) {
    addCondition("user_role", "=", params.userRole);
  }

  if (includeLang) {
    addCondition("lang", "=", params.lang);
  }

  return { conditions, queryParams };
}

function appendAndConditions(query: string, conditions: string[]): string {
  if (conditions.length === 0) {
    return query;
  }

  return `${query} AND ${conditions.join(" AND ")}`;
}

function parseCount(value: string | undefined): number {
  return Number.parseInt(value ?? "0", 10);
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
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
    includeLang: true,
  });

  let query = appendAndConditions(
    "SELECT word, COUNT(*) as cnt FROM word_counts WHERE 1=1",
    filterData.conditions,
  );

  query += ` GROUP BY word ORDER BY cnt DESC LIMIT $${filterData.queryParams.length + 1}`;

  const rows = await executeQuery<{ word: string; cnt: string }>(query, [
    ...filterData.queryParams,
    k,
  ]);

  return rows.map((row) => ({
    word: row.word,
    count: parseCount(row.cnt),
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
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
  });

  let query = appendAndConditions(
    "SELECT word, COUNT(*) as cnt FROM topic_counts WHERE 1=1",
    filterData.conditions,
  );

  query += ` GROUP BY word ORDER BY cnt DESC LIMIT $${filterData.queryParams.length + 1}`;

  const rows = await executeQuery<{ word: string; cnt: string }>(query, [
    ...filterData.queryParams,
    k,
  ]);

  return rows.map((row) => ({
    topic: row.word,
    count: parseCount(row.cnt),
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
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
  });

  const timeFilter =
    filterData.conditions.length > 0
      ? `WHERE ${filterData.conditions.join(" AND ")}`
      : "";

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
    filterData.queryParams,
  );

  return rows[0]?.mean_session_seconds ?? null;
}

/**
 * Get count of unique users from user_activity table
 */
export async function getUniqueUsers(
  params: MetricsQueryParams = {},
): Promise<number> {
  const filterData = buildFilterConditions(params, {
    includeUserRole: true,
  });

  const query = appendAndConditions(
    "SELECT COUNT(DISTINCT user_id) as cnt FROM user_activity WHERE 1=1",
    filterData.conditions,
  );

  const rows = await executeQuery<{ cnt: string }>(
    query,
    filterData.queryParams,
  );
  return parseCount(rows[0]?.cnt);
}

/**
 * Get total event count from user_activity table
 */
export async function getTotalActivityEvents(
  params: MetricsQueryParams = {},
): Promise<number> {
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
  });

  const query = appendAndConditions(
    "SELECT COUNT(*) as cnt FROM user_activity WHERE 1=1",
    filterData.conditions,
  );

  const rows = await executeQuery<{ cnt: string }>(
    query,
    filterData.queryParams,
  );
  return parseCount(rows[0]?.cnt);
}

/**
 * Return a mapping of user roles to the number of distinct users with that role from the user_activity table.
 */
export async function getUserRoleDistribution(
  params: MetricsQueryParams = {},
): Promise<Record<string, number>> {
  const filterData = buildFilterConditions(params);

  const query = appendAndConditions(
    `
    SELECT user_role, COUNT(DISTINCT user_id) as cnt 
    FROM user_activity 
    WHERE user_role IS NOT NULL
  `,
    filterData.conditions,
  );

  const rows = await executeQuery<{ user_role: string; cnt: string }>(
    `${query} GROUP BY user_role ORDER BY cnt DESC`,
    filterData.queryParams,
  );

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.user_role] = parseCount(row.cnt);
    return acc;
  }, {});
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
 */
export async function getActivityByDay(
  params: MetricsQueryParams = {},
): Promise<ActivityByDay[]> {
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
  });

  const query = `
    SELECT 
      to_str(ts, 'yyyy-MM-dd') as date,
      COUNT(*) as event_count,
      COUNT(DISTINCT user_id) as unique_users
    FROM user_activity
    ${appendAndConditions("WHERE 1=1", filterData.conditions)}
    GROUP BY to_str(ts, 'yyyy-MM-dd')
    ORDER BY date DESC
    LIMIT 30
  `;

  const rows = await executeQuery<{
    date: string;
    event_count: string;
    unique_users: string;
  }>(query, filterData.queryParams);

  return rows
    .map((row) => ({
      date: row.date,
      event_count: parseCount(row.event_count),
      unique_users: parseCount(row.unique_users),
    }))
    .reverse();
}

export interface HourlyActivity {
  hour: number;
  event_count: number;
}

/**
 * Compute activity counts for each hour of the day using optional time and user filters.
 */
export async function getHourlyActivityPattern(
  params: MetricsQueryParams = {},
): Promise<HourlyActivity[]> {
  const filterData = buildFilterConditions(params, {
    includeUserId: true,
    includeUserRole: true,
  });

  const query = `
    SELECT 
      EXTRACT(HOUR FROM ts) as hour,
      COUNT(*) as event_count
    FROM user_activity
    ${appendAndConditions("WHERE 1=1", filterData.conditions)}
    GROUP BY EXTRACT(HOUR FROM ts)
    ORDER BY hour
  `;

  const rows = await executeQuery<{
    hour: number;
    event_count: string;
  }>(query, filterData.queryParams);

  const hourlyMap = new Map<number, number>();
  for (const row of rows) {
    hourlyMap.set(row.hour, parseCount(row.event_count));
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    event_count: hourlyMap.get(hour) ?? 0,
  }));
}

export interface MetricsByTag {
  tag: string;
  avg_value: number;
  count: number;
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
  const filterData = buildFilterConditions(params);

  const query = `
    SELECT 
      to_str(ts, 'yyyy-MM-dd') as date,
      AVG(CASE WHEN tag = 'LLM_RESPONSE_TIME' THEN value ELSE NULL END) as llm_response_time,
      AVG(CASE WHEN tag = 'DOC_RESPONSE_TIME' THEN value ELSE NULL END) as doc_response_time
    FROM metrics
    ${appendAndConditions(
      "WHERE tag IN ('LLM_RESPONSE_TIME', 'DOC_RESPONSE_TIME')",
      filterData.conditions,
    )}
    GROUP BY to_str(ts, 'yyyy-MM-dd')
    ORDER BY date DESC
    LIMIT 30
  `;

  const rows = await executeQuery<{
    date: string;
    llm_response_time: number | null;
    doc_response_time: number | null;
  }>(query, filterData.queryParams);

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
  const filterData = buildFilterConditions(params);

  const query = `
    SELECT 
      SUM(CASE WHEN tag = 'NUM_LLM_TOKENS_IN' THEN value ELSE 0 END) as llm_tokens_in,
      SUM(CASE WHEN tag = 'NUM_LLM_TOKENS_OUT' THEN value ELSE 0 END) as llm_tokens_out,
      SUM(CASE WHEN tag = 'NUM_RAG_TOKENS_IN' THEN value ELSE 0 END) as rag_tokens_in,
      SUM(CASE WHEN tag = 'NUM_RAG_TOKENS_OUT' THEN value ELSE 0 END) as rag_tokens_out
    FROM metrics
    ${appendAndConditions(
      "WHERE tag IN ('NUM_LLM_TOKENS_IN', 'NUM_LLM_TOKENS_OUT', 'NUM_RAG_TOKENS_IN', 'NUM_RAG_TOKENS_OUT')",
      filterData.conditions,
    )}
  `;

  const rows = await executeQuery<{
    llm_tokens_in: number | null;
    llm_tokens_out: number | null;
    rag_tokens_in: number | null;
    rag_tokens_out: number | null;
  }>(query, filterData.queryParams);

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
  const filterData = buildFilterConditions(params);

  const query = `
    SELECT 
      AVG(CASE WHEN tag = 'CPU_USAGE' THEN value ELSE NULL END) as avg_cpu,
      AVG(CASE WHEN tag = 'RAM_USAGE' THEN value ELSE NULL END) as avg_ram,
      AVG(CASE WHEN tag = 'GPU_USAGE' THEN value ELSE NULL END) as avg_gpu,
      MAX(CASE WHEN tag = 'CPU_USAGE' THEN value ELSE NULL END) as max_cpu,
      MAX(CASE WHEN tag = 'RAM_USAGE' THEN value ELSE NULL END) as max_ram,
      MAX(CASE WHEN tag = 'GPU_USAGE' THEN value ELSE NULL END) as max_gpu
    FROM metrics
    ${appendAndConditions(
      "WHERE tag IN ('CPU_USAGE', 'RAM_USAGE', 'GPU_USAGE')",
      filterData.conditions,
    )}
  `;

  const rows = await executeQuery<{
    avg_cpu: number | null;
    avg_ram: number | null;
    avg_gpu: number | null;
    max_cpu: number | null;
    max_ram: number | null;
    max_gpu: number | null;
  }>(query, filterData.queryParams);

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
  const filterData = buildFilterConditions(params);

  const query = `
    SELECT AVG(value) as avg_docs
    FROM metrics
    ${appendAndConditions("WHERE tag = 'NUM_DOCS_RAG'", filterData.conditions)}
  `;

  const rows = await executeQuery<{ avg_docs: number | null }>(
    query,
    filterData.queryParams,
  );

  return rows[0]?.avg_docs ?? 0;
}
