# Performance Optimizations

This document outlines the performance optimizations implemented in the multi-tenant analytics dashboard to ensure fast load times and smooth user experience.

## Overview

The performance optimizations address Requirement 13 (Performance Optimization) from the requirements document, ensuring the dashboard loads quickly and handles large datasets efficiently.

## Implemented Optimizations

### 1. Mongoose Query Optimizations

#### `.lean()` for Read-Only Queries
All read-only Mongoose queries use `.lean()` to skip Mongoose document hydration, resulting in faster queries and reduced memory usage.

**Files affected:**
- `src/server/api/routers/metrics.ts`
- `src/server/api/routers/preferences.ts`

**Example:**
```typescript
const metrics = await RAGMetric.find(filter)
  .select({ /* fields */ })
  .sort({ timestamp: -1 })
  .lean()  // Skip Mongoose hydration for better performance
  .exec();
```

#### Field Projection
Queries use MongoDB field projection to limit returned fields, reducing data transfer and improving response times.

**Example:**
```typescript
const metrics = await RAGMetric.find(filter)
  .select({
    usage_metrics: 1,
    rag_quality_metrics: 1,
    performance_metrics: 1,
    timestamp: 1,
    nodeId: 1,
  })
  .lean()
  .exec();
```

### 2. React Query Configuration

#### Optimized Cache Settings
React Query is configured with appropriate `staleTime` and `gcTime` (formerly `cacheTime`) values to balance freshness with performance.

**Configuration** (`src/trpc/query-client.ts`):
- `staleTime: 30s` - Data is considered fresh for 30 seconds
- `gcTime: 5min` - Unused data stays in cache for 5 minutes
- `refetchOnWindowFocus: false` - Prevents unnecessary refetches
- `retry: 1` - Limits retry attempts to reduce latency

**Benefits:**
- Reduces unnecessary API calls
- Improves perceived performance
- Maintains data freshness
- Reduces server load

### 3. Pagination Support

#### Query Pagination
Large datasets can be fetched in chunks using pagination parameters.

**Implementation:**
- Added `skip` parameter to metrics query schema
- Created `usePaginatedMetrics` hook for easy pagination
- Supports page-based navigation

**Usage:**
```typescript
const { data, nextPage, prevPage, hasNextPage } = usePaginatedMetrics({
  nodeId,
  dateRange,
  pageSize: 100,
});
```

### 4. Database-Level Aggregation

#### MongoDB Aggregation Pipelines
Statistics are computed at the database level using MongoDB aggregation pipelines instead of fetching all data and computing client-side.

**Benefits:**
- Reduces data transfer
- Leverages database optimization
- Faster computation
- Lower memory usage

**Example:**
```typescript
const stats = await RAGMetric.aggregate([
  { $match: matchStage },
  {
    $group: {
      _id: null,
      avgResponseTime: { $avg: '$performance_metrics.average_response_time_ms' },
      totalQueries: { $sum: '$usage_metrics.processed_queries.total' },
      // ... more aggregations
    },
  },
]);
```

### 5. Server-Side Data Prefetching

#### Next.js Server Components
The main dashboard page prefetches critical data on the server before rendering, reducing client-side loading time.

**Implementation** (`src/app/page.tsx`):
```typescript
await Promise.all([
  api.metrics.get.prefetch({}),
  api.metrics.getStats.prefetch({}),
  api.preferences.get.prefetch(),
]);
```

**Benefits:**
- Faster initial page load
- Better SEO
- Improved user experience
- Reduced layout shift

### 6. Loading Skeletons

#### Improved Perceived Performance
Loading skeletons provide visual feedback during data fetching, improving perceived performance.

**Components:**
- `Skeleton` - Base skeleton component
- `ChartSkeleton` - Loading state for charts
- `StatCardSkeleton` - Loading state for stat cards
- `NodeSelectorSkeleton` - Loading state for node selector
- Enhanced `LoadingState` in dashboard and nodes page

**Benefits:**
- Better user experience
- Reduced perceived loading time
- Clear visual feedback
- Professional appearance

### 7. Database Indexes

#### Optimized Query Performance
Database indexes are created for frequently queried fields to speed up data retrieval.

**Indexes:**
- `{ nodeId: 1, timestamp: -1 }` - Compound index for time-series queries
- `{ nodeId: 1 }` - Single field index for node filtering
- `{ timestamp: -1 }` - Index for timestamp sorting

**Benefits:**
- Faster query execution
- Reduced database load
- Better scalability

## Performance Metrics

### Expected Improvements

1. **Query Response Time**: 40-60% reduction with `.lean()` and projection
2. **Initial Page Load**: 30-50% faster with server-side prefetching
3. **Cache Hit Rate**: 70-80% with optimized React Query settings
4. **Data Transfer**: 30-40% reduction with field projection
5. **Perceived Load Time**: 50-70% improvement with loading skeletons

### Monitoring

Monitor these metrics to ensure optimizations are effective:
- API response times
- Cache hit/miss ratios
- Database query execution times
- Client-side rendering performance
- Time to First Contentful Paint (FCP)
- Time to Interactive (TTI)

## Best Practices

### When Adding New Queries

1. Always use `.lean()` for read-only queries
2. Use field projection to limit returned data
3. Add appropriate database indexes
4. Configure query-specific cache settings if needed
5. Implement loading skeletons for better UX

### When Adding New Components

1. Use loading skeletons during data fetching
2. Implement error boundaries
3. Optimize re-renders with `useMemo` and `useCallback`
4. Lazy load heavy components when possible

### When Aggregating Data

1. Use MongoDB aggregation pipelines
2. Compute statistics at database level
3. Limit result sets with pagination
4. Cache aggregated results appropriately

## Future Optimizations

Potential future improvements:
1. Implement Redis caching for frequently accessed data
2. Add service worker for offline support
3. Implement virtual scrolling for large lists
4. Add image optimization for any future media
5. Implement code splitting for route-based chunks
6. Add compression for API responses
7. Implement request deduplication
8. Add query result streaming for large datasets

## Related Requirements

- **Requirement 13.1**: Server-side data prefetching ✅
- **Requirement 13.2**: Client-side caching with React Query ✅
- **Requirement 13.3**: MongoDB aggregation pipelines ✅
- **Requirement 13.4**: Pagination and field projection ✅
- **Requirement 13.5**: Database-level aggregation ✅

## References

- [Mongoose Performance Tips](https://mongoosejs.com/docs/tutorials/lean.html)
- [React Query Performance](https://tanstack.com/query/latest/docs/react/guides/performance)
- [MongoDB Aggregation](https://www.mongodb.com/docs/manual/aggregation/)
- [Next.js Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)
