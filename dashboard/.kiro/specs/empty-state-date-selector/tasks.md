# Implementation Plan

- [x] 1. Create helper function to detect empty data state
  - Add `isEmptyData` function to metrics-dashboard.tsx that checks if MetricsResponse contains zero metrics
  - Function should check `processed_queries.total`, `active_sessions.daily`, and `unique_users.daily` are all zero
  - _Requirements: 1.1, 2.1_

- [x] 2. Extract PersistentHeader component
  - [x] 2.1 Create new PersistentHeader component in metrics-dashboard.tsx
    - Extract date range selector, metadata display, and action buttons from current implementation
    - Accept props: dateRange, onDateRangeChange, lastUpdated, stats, isFetching, onRefresh, nodeId, userRole
    - Maintain existing styling and responsive behavior
    - _Requirements: 1.1, 3.1_
  
  - [x] 2.2 Update MetricsDashboard to use PersistentHeader
    - Move date controls and action buttons to PersistentHeader component
    - Render PersistentHeader outside conditional data blocks
    - Ensure PersistentHeader renders when user is authenticated and not in initial loading state
    - _Requirements: 1.1, 1.3, 3.1_

- [x] 3. Update empty state handling in MetricsDashboard
  - [x] 3.1 Add empty data detection logic
    - Use `isEmptyData` helper to distinguish between empty data and errors
    - Update conditional rendering to handle empty data state separately from error state
    - _Requirements: 1.1, 2.1, 2.2_
  
  - [x] 3.2 Update NoMetricsEmptyState message
    - Change message to "No hay datos disponibles para el rango de fechas seleccionado"
    - Update tips to focus on adjusting date range
    - Remove date range selector from this component (now in PersistentHeader)
    - _Requirements: 1.4, 2.3_
  
  - [x] 3.3 Ensure empty state renders with PersistentHeader visible
    - Verify layout structure shows PersistentHeader above empty state
    - Test that date range changes trigger refetch from empty state
    - _Requirements: 1.1, 1.2, 2.4_

- [x] 4. Update error state handling
  - Ensure actual errors (network, auth, server) still display ErrorState without date controls
  - Verify error classification logic correctly identifies error types
  - Test that UNAUTHORIZED and FORBIDDEN errors show ErrorState
  - _Requirements: 2.2_

- [x] 5. Verify date range interaction during loading states
  - Ensure Date Range Selector remains interactive during data fetching
  - Verify that changing date range during fetch updates query parameters
  - Test that loading indicators display correctly while date controls remain enabled
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 6. Update component styling and layout
  - Ensure consistent spacing between PersistentHeader and content area
  - Verify responsive behavior on mobile devices
  - Test layout transitions between empty, loading, and data states
  - _Requirements: 1.3_
