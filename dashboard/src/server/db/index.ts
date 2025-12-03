export { closePool, executeQuery } from "./connection";
export {
  countMetrics,
  getErrorRate,
  getRequestStats,
  getTotalActivityEvents,
  getUniqueUsers,
  getUserRoleDistribution,
  meanMetric,
  meanSessionLength,
  type MetricsQueryParams,
  type RequestStats,
  type SearchTerm,
  type TopicCount,
  topKTopics,
  topKSearchTerms,
} from "./metrics-queries";
