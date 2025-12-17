/**
 * These tags are used to query the metrics table in QuestDB
 */
export const Metrics = {
  CPU_USAGE: "CPU_USAGE", // Percentage of CPU used
  RAM_USAGE: "RAM_USAGE", // Percentage of RAM used
  GPU_USAGE: "GPU_USAGE", // Percentage of GPU used

  LLM_RESPONSE_TIME: "LLM_RESPONSE_TIME", // LLM response time
  DOC_RESPONSE_TIME: "DOC_RESPONSE_TIME", // RAG latency

  RELEVANT_DOC_RATE: "RELEVANT_DOC_RATE", // % of relevant documents retrieved

  NUM_DOCS_RAG: "NUM_DOCS_RAG", // Number of docs returned by the RAG
  NUM_DOCS_LLM: "NUM_DOCS_LLM", // Number of relevant documents after filtering

  NUM_LLM_TOKENS_IN: "NUM_LLM_TOKENS_IN", // Number of LLM input tokens
  NUM_LLM_TOKENS_OUT: "NUM_LLM_TOKENS_OUT", // Number of LLM output tokens
  NUM_RAG_TOKENS_IN: "NUM_RAG_TOKENS_IN", // Number of RAG input tokens
  NUM_RAG_TOKENS_OUT: "NUM_RAG_TOKENS_OUT", // Number of RAG output tokens
} as const;

export type MetricTag = (typeof Metrics)[keyof typeof Metrics];

