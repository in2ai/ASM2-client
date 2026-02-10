import { executeQuery } from "../connection";
import {
  appendAndConditions,
  buildFilterConditions,
  parseCount,
} from "./shared";
import type {
  ActivityByDay,
  HourlyActivity,
  MetricsQueryParams,
} from "./types";

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
