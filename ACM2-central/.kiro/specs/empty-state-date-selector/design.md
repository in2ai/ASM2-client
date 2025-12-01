# Design Document

## Overview

This design enhances the metrics dashboard empty state to maintain date range selector visibility, improving user experience when no data is available. The solution involves restructuring the component hierarchy to separate date controls from data-dependent content and updating the empty state component to accept and display date controls.

## Architecture

### Component Hierarchy Changes

The current architecture renders date controls conditionally within the data-loaded state. The new architecture will:

1. **Lift Date Controls**: Move the Date Range Selector outside the conditional data rendering block
2. **Persistent Header**: Create a persistent header section that always renders, containing:
   - Date Range Selector
   - Action buttons (Export, Refresh)
   - Metadata display (last updated, record count)
3. **Content Area**: Separate content area that switches between:
   - Loading state
   - Empty state (with helpful message)
   - Error state (for actual errors)
   - Data visualization (charts and metrics)

### State Management

The component will distinguish between three scenarios:

1. **Loading State** (`isPending` or initial `isFetching`): Show loading skeleton with date controls
2. **Empty Data State** (`data` exists but contains no metrics): Show empty state message with date controls
3. **Error State** (`isError` with actual error): Show error message, optionally with date controls for recoverable errors

## Components and Interfaces

### Modified Components

#### 1. MetricsDashboard Component

**Changes:**
- Restructure JSX to render date controls outside conditional blocks
- Add logic to detect empty data vs. actual errors
- Pass date range state and handlers to empty state component

**New Structure:**
```typescript
return (
  <AppLayout>
    {(view) => (
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6 lg:p-8">
        {/* Persistent Header - Always Visible */}
        {user && !isPending && (
          <PersistentHeader
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            lastUpdated={lastUpdated}
            stats={stats}
            isFetching={isFetching}
            onRefresh={refetch}
            nodeId={nodeId}
            userRole={user.role}
          />
        )}

        {/* Content Area - Conditional Rendering */}
        {isPending ? (
          <LoadingState />
        ) : !user ? (
          <ErrorState {...authError} />
        ) : isError ? (
          <ErrorState {...errorProps} />
        ) : !data || isEmptyData(data) ? (
          <EmptyDataState />
        ) : (
          <DataVisualization data={data} view={view} />
        )}
      </div>
    )}
  </AppLayout>
);
```

#### 2. NoMetricsEmptyState Component

**Changes:**
- Remove date range selector from this component (it will be in the persistent header)
- Update message to be more specific about date range
- Simplify tips to focus on date range adjustment

**Updated Props:**
```typescript
interface NoMetricsEmptyStateProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  // Remove date range props - handled by parent
}
```

#### 3. New PersistentHeader Component

**Purpose:** Extract the header section into a reusable component

**Props:**
```typescript
interface PersistentHeaderProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  lastUpdated: string | undefined;
  stats: StatsResponse | undefined;
  isFetching: boolean;
  onRefresh: () => void;
  nodeId: string | undefined;
  userRole: string | undefined;
}
```

**Responsibilities:**
- Render date range selector
- Display metadata (last updated, record count)
- Render action buttons (Export, Refresh)
- Handle loading indicators during refresh

### Helper Functions

#### isEmptyData

**Purpose:** Determine if the response contains no metrics data

**Signature:**
```typescript
function isEmptyData(data: MetricsResponse): boolean {
  // Check if usage metrics indicate no data
  return (
    data.usage_metrics.processed_queries.total === 0 &&
    data.usage_metrics.active_sessions.daily === 0 &&
    data.usage_metrics.unique_users.daily === 0
  );
}
```

## Data Models

No changes to existing data models. The component will work with existing:
- `MetricsResponse` type
- `DateRange` type from react-day-picker
- `RouterOutputs["metrics"]["get"]` type

## Error Handling

### Error Classification

1. **Network/Server Errors**: Display ErrorState without date controls
   - UNAUTHORIZED
   - FORBIDDEN
   - Network failures
   - Server errors (500, 503)

2. **Empty Data**: Display EmptyState with date controls
   - Valid response with zero metrics
   - No data in selected date range

3. **Authentication Errors**: Display ErrorState without date controls
   - User not authenticated
   - Session expired

### Error Detection Logic

```typescript
// In MetricsDashboard component
const hasActualError = isError && !error?.message?.includes("No metrics data found");
const hasEmptyData = !isError && data && isEmptyData(data);

// Render logic
if (hasActualError) {
  return <ErrorState {...errorProps} />;
}

if (hasEmptyData) {
  return <EmptyDataState />;
}
```

## Testing Strategy

### Unit Tests

1. **Component Rendering Tests**
   - Verify PersistentHeader renders with date controls
   - Verify EmptyState displays correct message
   - Verify date controls remain visible in empty state

2. **State Transition Tests**
   - Test transition from loading to empty state
   - Test transition from empty to data-loaded state
   - Test transition from data-loaded to empty state

3. **Error Classification Tests**
   - Test isEmptyData function with various data shapes
   - Test error vs. empty data detection logic

### Integration Tests

1. **User Interaction Tests**
   - Test date range change triggers refetch
   - Test refresh button in empty state
   - Test export button availability

2. **Data Flow Tests**
   - Test query parameter updates on date change
   - Test loading states during refetch
   - Test data display after date range adjustment

### Visual Regression Tests

1. **Layout Tests**
   - Verify date controls position consistency
   - Verify empty state layout
   - Verify responsive behavior

## Implementation Notes

### Accessibility

- Maintain ARIA labels on date controls
- Ensure empty state message is announced to screen readers
- Keep keyboard navigation functional in all states

### Performance

- Avoid unnecessary re-renders of PersistentHeader
- Use React.memo for PersistentHeader if needed
- Maintain existing query caching behavior

### Responsive Design

- Ensure date controls remain usable on mobile
- Maintain existing responsive breakpoints
- Test empty state message readability on small screens

### Localization

- Update empty state messages to Spanish (matching existing UI)
- Maintain existing date formatting
- Keep consistent terminology with current implementation
