# Implementation Plan

This implementation plan breaks down the multi-tenant analytics dashboard feature into discrete, actionable coding tasks. Each task builds incrementally on previous work, with all code integrated and functional at each step.

## Task List

- [x] 1. Set up WorkOS authentication infrastructure
  - Configure WorkOS environment variables in env.js with Zod validation
  - Install and configure @workos-inc/authkit-nextjs package
  - Create Next.js middleware for session management
  - Set up callback route handler at /api/auth/callback
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 2. Implement authentication UI components
  - Update root layout to include AuthKitProvider wrapper
  - Create sign-in and sign-out functionality in page components
  - Add user session display in header/navigation
  - Implement loading states for authentication
  - _Requirements: 1.1, 1.2, 1.3, 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 3. Enhance TRPC context with user authentication
  - Update createTRPCContext to extract WorkOS user session
  - Create UserContext interface with role and organization mapping
  - Map WorkOS organization ID to nodeId
  - Extract and normalize user role from WorkOS metadata
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Create authorization middleware and procedures
  - Implement protectedProcedure middleware for authenticated users
  - Implement adminProcedure middleware for administrator-only access
  - Add proper error handling with UNAUTHORIZED and FORBIDDEN codes
  - Update existing publicProcedure to maintain backward compatibility
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 5. Create Node/Company data model
  - Define INode interface with nodeId, name, and workosOrganizationId
  - Create Mongoose schema for Node collection
  - Add indexes for nodeId and workosOrganizationId
  - Create seed script to populate initial nodes from existing metrics
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 6. Add database indexes for multi-tenant queries
  - Create compound index on RAGMetric: { nodeId: 1, timestamp: -1 }
  - Create single index on RAGMetric: { nodeId: 1 }
  - Verify index creation in database connection utility
  - Update seed script to create indexes automatically
  - _Requirements: 3.1, 3.2, 3.3, 13.1, 13.2, 13.3_

- [x] 7. Update metrics router with authorization
  - Add Zod input schemas for metrics queries with nodeId parameter
  - Update metrics.get procedure to use protectedProcedure
  - Implement automatic nodeId filtering for end users
  - Allow administrators to specify nodeId or view all nodes
  - Add date range filtering support (startDate, endDate)
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 10.3_

- [x] 8. Create aggregated statistics endpoint
  - Implement metrics.getStats procedure with MongoDB aggregation
  - Calculate average response time, total queries, and user counts
  - Apply role-based filtering (user sees own node, admin sees selected/all)
  - Return null for empty datasets with appropriate messaging
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 13.3, 13.4_

- [x] 9. Implement node management endpoints (admin-only)
  - Create metrics.listNodes procedure using adminProcedure
  - Implement metrics.getNodeSummary for individual node details
  - Include latest metric timestamp and document count per node
  - Add filtering for active/inactive nodes
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 10. Create NodeSelector component for administrators
  - Build dropdown component using shadcn/ui Select
  - Fetch available nodes using metrics.listNodes query
  - Handle node selection and URL parameter updates
  - Include "All Nodes" option for global view
  - Implement loading and error states
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3_

- [x] 11. Update AppLayout with role-aware navigation
  - Use useAuth hook to detect user role
  - Conditionally render NodeSelector for administrators
  - Display static company name for end users
  - Add role indicator badge in user menu
  - Ensure consistent styling between admin and user views
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 19.1, 19.2, 19.3_

- [x] 12. Enhance MetricsDashboard with context-aware queries
  - Extract nodeId from URL search params for admins
  - Use user's organizationId for end users automatically
  - Update metrics.get query to include nodeId parameter
  - Update stats query with same nodeId logic
  - Handle loading, error, and empty states appropriately
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.3_

- [x] 13. Implement date range filtering
  - Create DateRangeSelector component with preset options (7, 30, 90 days)
  - Add custom date range picker using shadcn/ui Calendar
  - Store selected range in component state
  - Pass startDate and endDate to metrics queries
  - Set default to last 30 days
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 14. Add automatic data refresh functionality
  - Configure React Query refetchInterval to 60 seconds
  - Display subtle loading indicator during background refresh
  - Maintain scroll position and view state during refresh
  - Add manual refresh button with loading state
  - Disable refresh button while operation is in progress
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 15. Implement error handling and user feedback
  - Create custom error classes (UnauthorizedError, ForbiddenError, NodeNotFoundError)
  - Update TRPC error formatter with user-friendly messages
  - Create ErrorBoundary component for client-side errors
  - Update ErrorState component with retry functionality
  - Add empty state component with helpful guidance
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 16. Add data export functionality
  - Create export button component in dashboard header
  - Implement CSV generation from current metrics data
  - Include node name, date range, and timestamp in filename
  - Respect authorization rules in export endpoint
  - Limit exports to 10,000 rows
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 17. Implement user preferences storage
  - Create IUserPreferences interface and schema
  - Store chart visibility preferences in database
  - Store default date range and node selection (admin)
  - Create preferences API endpoints
  - Load and apply preferences on dashboard mount
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 18. Create nodes management page (admin-only)
  - Build /admin/nodes page with table of all nodes
  - Display node name, ID, last metric timestamp, and metrics count
  - Add click-through navigation to node-specific dashboard
  - Sort nodes by most recent activity
  - Implement loading and empty states
  - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 19. Enhance responsive design for mobile and tablet
  - Update sidebar to collapse into hamburger menu on mobile
  - Stack charts vertically on tablet breakpoints
  - Ensure touch-friendly button and control sizes
  - Test and adjust NodeSelector for mobile
  - Verify all functionality works on small screens
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 20. Add environment configuration documentation
  - Create .env.example file with all required variables
  - Document WorkOS setup steps in README
  - Add MongoDB connection string format examples
  - Document role mapping configuration
  - Include troubleshooting section for common issues
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 21. Create database migration script
  - Write setup-multi-tenant.ts script for initial setup
  - Create indexes programmatically
  - Migrate existing metrics without nodeId if needed
  - Seed initial Node documents from WorkOS organizations
  - Add verification and rollback capabilities
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 22. Implement performance optimizations
  - Add .lean() to all read-only Mongoose queries
  - Configure React Query with appropriate staleTime and cacheTime
  - Implement query result pagination for large datasets
  - Use projection to limit returned fields where appropriate
  - Add loading skeletons for better perceived performance
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 23. Add security headers and CSRF protection
  - Configure Content Security Policy headers in next.config.js
  - Verify SameSite cookie attributes for session
  - Ensure all forms use CSRF tokens
  - Add rate limiting configuration (preparation for future)
  - Document security best practices
  - _Requirements: 6.4, 6.5, 7.1, 7.2, 7.3_

- [ ]* 24. Write unit tests for TRPC procedures
  - Test protectedProcedure with authenticated and unauthenticated users
  - Test adminProcedure with admin and non-admin users
  - Test metrics.get with different role and nodeId combinations
  - Test input validation with invalid Zod schemas
  - Test error handling for various failure scenarios
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3_

- [ ]* 25. Write integration tests for authentication
  - Test WorkOS callback handling and session creation
  - Test session persistence across requests
  - Test automatic session refresh
  - Test logout and session termination
  - Test middleware protection of routes
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 26. Write component tests for UI elements
  - Test NodeSelector with mock node data
  - Test role-based rendering in AppLayout
  - Test DateRangeSelector functionality
  - Test chart visibility controls
  - Test error boundary behavior
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3_

- [ ]* 27. Create end-to-end tests for user journeys
  - Test complete end user flow (sign in, view dashboard, filter, export, sign out)
  - Test complete administrator flow (sign in, switch nodes, view all nodes, sign out)
  - Test security: attempt to access other org data via URL manipulation
  - Test security: attempt admin endpoints as regular user
  - Test session expiration handling
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.3_

## Notes

- Tasks marked with `*` are optional testing tasks that can be skipped for faster MVP delivery
- Each task should be completed and tested before moving to the next
- All code must be integrated into the existing application, not left orphaned
- Follow the existing code style and patterns in the codebase
- Ensure TypeScript types are properly defined for all new code
- Use neverthrow for error handling where appropriate
- All database queries must include proper error handling
