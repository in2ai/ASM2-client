export { closePool, executeQuery } from "./connection";
export {
  countMetrics,
  getActivityByDay,
  getAvgDocsPerQuery,
  getHourlyActivityPattern,
  getMetricsByTag,
  getResponseTimeTrend,
  getSystemHealthStats,
  getTokenUsageStats,
  getTotalActivityEvents,
  getUniqueUsers,
  getUserRoleDistribution,
  meanMetric,
  meanSessionLength,
  topKSearchTerms,
  topKTopics,
  type ActivityByDay,
  type HourlyActivity,
  type MetricsByTag,
  type MetricsQueryParams,
  type ResponseTimeTrend,
  type SearchTerm,
  type SystemHealthStats,
  type TokenUsageStats,
  type TopicCount
} from "./metrics-queries";

