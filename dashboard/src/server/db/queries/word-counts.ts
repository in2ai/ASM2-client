import { executeQuery } from "../connection";
import {
  appendAndConditions,
  buildFilterConditions,
  parseCount,
} from "./shared";
import type { MetricsQueryParams, SearchTerm } from "./types";

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
