import { executeQuery } from "../connection";
import { appendAndConditions, buildFilterConditions } from "./shared";
import type {
  MetricsQueryParams,
  ResponseTimeTrend,
  SystemHealthStats,
  TokenUsageStats,
} from "./types";

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
