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
    "SELECT topic_id, MAX(word) as fallback_word, COUNT(*) as cnt FROM topic_counts WHERE 1=1",
    filterData.conditions,
  );

  query += ` GROUP BY topic_id ORDER BY cnt DESC LIMIT $${filterData.queryParams.length + 1}`;

  const rows = await executeQuery<{
    topic_id: string | null;
    fallback_word: string;
    cnt: string;
  }>(query, [...filterData.queryParams, k]);

  const topicIds = Array.from(
    new Set(
      rows
        .map((row) => row.topic_id)
        .filter((topicId): topicId is string => Boolean(topicId)),
    ),
  );

  const translatedByTopicId = new Map<string, string>();

  if (params.lang && topicIds.length > 0) {
    const topicIdPlaceholders = topicIds
      .map((_, index) => `$${index + 2}`)
      .join(", ");

    const intlQuery = `
      SELECT topic_id, MAX(word) as translated_word
      FROM topic_intl
      WHERE lang = $1
        AND topic_id IN (${topicIdPlaceholders})
      GROUP BY topic_id
    `;

    const intlRows = await executeQuery<{
      topic_id: string;
      translated_word: string;
    }>(intlQuery, [params.lang, ...topicIds]);

    for (const row of intlRows) {
      translatedByTopicId.set(row.topic_id, row.translated_word);
    }
  }

  return rows.map((row) => ({
    topic:
      (row.topic_id ? translatedByTopicId.get(row.topic_id) : undefined) ??
      row.fallback_word,
    count: parseCount(row.cnt),
  }));
}
