import { executeQuery } from "../connection";
import {
  appendAndConditions,
  buildFilterConditions,
  parseCount,
} from "./shared";
import type { MetricsQueryParams, TopicCount } from "./types";

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
