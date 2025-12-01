# Implementation Plan

- [x] 1. Set up metrics service API client
  - [x] 1.1 Create metrics API client module
    - Create `dashboard/src/lib/metrics-api.ts` with typed HTTP client
    - Implement `getMeanMetric`, `getTopSearchTerms`, `getMeanSessionLength` methods
    - Add error handling for network failures and API errors
    - _Requirements: 1.1, 1.3_
  - [ ]* 1.2 Write property test for date range parameter propagation
    - **Property 2: Date Range Parameter Propagation**
    - **Validates: Requirements 1.4**
  - [x] 1.3 Update environment configuration
    - Replace `MONGODB_URI` with `METRICS_SERVICE_URL` in `dashboard/src/env.js`
    - Update `.env.example` with new environment variable
    - _Requirements: 1.1_

- [x] 2. Update tRPC metrics router
  - [x] 2.1 Refactor metrics router to use API client
    - Remove MongoDB/Mongoose imports from `dashboard/src/server/api/routers/metrics.ts`
    - Implement `get` procedure using metrics API client
    - Implement `getStats` procedure using metrics API client
    - Implement `exportMetrics` procedure using metrics API client
    - Remove `listNodes` and `getNodeSummary` procedures
    - _Requirements: 1.1, 1.2, 3.2, 7.1, 7.2, 7.3_
  - [ ]* 2.2 Write property test for API response transformation
    - **Property 1: API Response Transformation Consistency**
    - **Validates: Requirements 1.2**
  - [ ]* 2.3 Write property test for router transformation correctness
    - **Property 7: Router Transformation Correctness**
    - **Validates: Requirements 7.1**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update preferences router and model
  - [x] 4.1 Remove node-related fields from preferences
    - Update `dashboard/src/server/api/routers/preferences.ts` to remove `defaultNodeId` handling
    - Update `dashboard/src/models/user-preferences.ts` to remove `defaultNodeId` field
    - _Requirements: 8.1, 8.2_
  - [ ]* 4.2 Write property test for preferences node field exclusion
    - **Property 8: Preferences Node Field Exclusion**
    - **Validates: Requirements 8.2**

- [x] 5. Remove MongoDB and node-related code
  - [x] 5.1 Remove MongoDB connection and models
    - Delete `dashboard/src/lib/db.ts` (MongoDB connection)
    - Delete `dashboard/src/models/metric.ts` (RAGMetric model)
    - Delete `dashboard/src/models/node.ts` (Node model)
    - Update `dashboard/src/models/index.ts` to remove deleted exports
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 5.2 Remove node-related UI components
    - Delete `dashboard/src/components/node-selector.tsx`
    - Delete `dashboard/src/components/node-selector-skeleton.tsx`
    - Update `dashboard/src/components/index.ts` to remove deleted exports
    - _Requirements: 3.1_
  - [x] 5.3 Remove admin nodes management page
    - Delete `dashboard/src/app/admin/nodes/` directory
    - _Requirements: 3.3_
  - [x] 5.4 Update app layout to remove node functionality
    - Remove `NodeSelector` import and usage from `dashboard/src/app/_components/app-layout.tsx`
    - Remove admin-only "Gestión de Nodos" menu item
    - Simplify `CompanyDisplay` component to show user info only
    - _Requirements: 3.1, 3.4_

- [x] 6. Update dashboard components for new data structure
  - [x] 6.1 Update metrics dashboard component
    - Update `dashboard/src/app/_components/metrics-dashboard.tsx` to work with new data structure
    - Remove `nodeId` parameter handling from queries
    - Update data display to match new API response format
    - _Requirements: 3.4, 6.1, 6.2, 6.3_
  - [ ]* 6.2 Write property test for metrics display accuracy
    - **Property 5: Metrics Display Accuracy**
    - **Validates: Requirements 6.1**
  - [ ]* 6.3 Write property test for search terms display completeness
    - **Property 6: Search Terms Display Completeness**
    - **Validates: Requirements 6.2**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update authentication and user context
  - [x] 8.1 Simplify tRPC context for single-node architecture
    - Update `dashboard/src/server/api/trpc.ts` to remove node-related context
    - Keep user authentication and tracking functionality
    - _Requirements: 4.1, 4.2_
  - [ ]* 8.2 Write property test for authentication enforcement
    - **Property 3: Authentication Enforcement**
    - **Validates: Requirements 4.1**
  - [ ]* 8.3 Write property test for user context propagation
    - **Property 4: User Context Propagation**
    - **Validates: Requirements 4.2**

- [x] 9. Update Docker configuration

  - [x] 9.1 Add dashboard service to main docker-compose.yml
    - Add dashboard service configuration to root `docker-compose.yml`
    - Configure environment variables including `METRICS_SERVICE_URL`
    - Set up service dependencies (depends_on metrics_service)
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 9.2 Remove dashboard's standalone docker-compose.yml MongoDB references
    - Update or remove `dashboard/docker-compose.yml` as it's no longer needed
    - _Requirements: 2.1_

- [x] 10. Update package.json and cleanup
  - [x] 10.1 Remove MongoDB dependencies
    - Remove `mongoose` from `dashboard/package.json` dependencies
    - Remove seed scripts that use MongoDB (`seed`, `seed:nodes`, `migrate:*`)
    - _Requirements: 2.1, 2.2_
  - [x] 10.2 Remove unused lib files
    - Delete `dashboard/src/lib/errors.ts` if it only contains MongoDB-related errors
    - Clean up any other unused imports or files
    - _Requirements: 2.3_

- [ ] 11. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
