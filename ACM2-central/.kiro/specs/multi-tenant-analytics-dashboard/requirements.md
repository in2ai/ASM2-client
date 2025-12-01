# Requirements Document

## Introduction

This document defines the requirements for transforming the existing ACM2 Central metrics dashboard into a comprehensive multi-tenant analytics platform. The system SHALL enable secure, role-based access to RAG (Retrieval-Augmented Generation) metrics across multiple organizations (nodes/companies), with administrators having global visibility and end users restricted to their own organization's data.

The platform builds upon the existing Next.js application with MongoDB, TRPC, and shadcn/ui components, adding WorkOS authentication, multi-tenant data isolation, and role-aware navigation and filtering.

## Glossary

- **System**: The ACM2 Central multi-tenant analytics dashboard application
- **Administrator**: A user with elevated privileges who can view and switch between all nodes/companies
- **End User**: A user associated with a specific node/company who can only view their own organization's data
- **Node**: An organization or company entity that owns metrics data (synonymous with Company)
- **Company**: An organization or company entity that owns metrics data (synonymous with Node)
- **RAG Metric**: A document containing usage, quality, performance, and analytics data for a specific node at a specific timestamp
- **WorkOS**: The authentication and user management service provider
- **TRPC Procedure**: A type-safe API endpoint in the TRPC router
- **Context**: The currently selected node/company for viewing metrics (admin-only concept)
- **Multi-tenant Boundary**: The security enforcement that prevents users from accessing data belonging to other organizations

## Requirements

### Requirement 1: User Authentication and Session Management

**User Story:** As a user, I want to securely authenticate using WorkOS so that I can access the dashboard with my organizational credentials.

#### Acceptance Criteria

1. WHEN a user navigates to the System, THE System SHALL redirect unauthenticated users to the WorkOS authentication page
2. WHEN a user successfully authenticates via WorkOS, THE System SHALL create a secure session with user identity and role information
3. WHEN a user session expires, THE System SHALL redirect the user to the authentication page
4. THE System SHALL retrieve user profile information from WorkOS including email, name, and organization ID
5. WHEN a user clicks logout, THE System SHALL terminate the session and redirect to the authentication page

### Requirement 2: Role Detection and Assignment

**User Story:** As the system, I want to automatically detect user roles based on WorkOS organization data so that I can enforce appropriate access controls.

#### Acceptance Criteria

1. WHEN a user authenticates, THE System SHALL determine if the user is an Administrator or End User based on WorkOS role metadata
2. THE System SHALL associate End Users with their specific node identifier from WorkOS organization data
3. THE System SHALL store role and node association in the TRPC context for all subsequent requests
4. WHERE a user has administrator privileges in WorkOS, THE System SHALL grant Administrator role in the System
5. WHERE a user does not have administrator privileges, THE System SHALL grant End User role with node association

### Requirement 3: Data Model Enhancement for Multi-tenancy

**User Story:** As a developer, I want the metric data model to properly support multi-tenant queries so that data can be efficiently filtered by node/company.

#### Acceptance Criteria

1. THE System SHALL maintain the existing RAGMetric schema with nodeId as a required field
2. THE System SHALL create a MongoDB index on the nodeId field for query performance
3. THE System SHALL create a compound index on nodeId and timestamp fields for time-series queries
4. THE System SHALL validate that all metric documents contain a valid nodeId before insertion
5. THE System SHALL ensure nodeId is immutable after document creation

### Requirement 4: Administrator Global Dashboard Access

**User Story:** As an Administrator, I want to view aggregated metrics across all nodes so that I can monitor the entire platform's performance.

#### Acceptance Criteria

1. WHEN an Administrator accesses the dashboard, THE System SHALL display a node selector in the top navigation bar
2. THE System SHALL provide an "All Nodes" option in the node selector that aggregates data across all organizations
3. WHEN an Administrator selects "All Nodes", THE System SHALL fetch and aggregate metrics from all nodes in the database
4. WHEN an Administrator selects a specific node, THE System SHALL display metrics filtered to that node only
5. THE System SHALL persist the Administrator's node selection across page navigation within the session

### Requirement 5: Administrator Node Switching

**User Story:** As an Administrator, I want to switch between different nodes/companies so that I can investigate specific organization metrics.

#### Acceptance Criteria

1. WHEN an Administrator opens the node selector, THE System SHALL display a list of all available nodes with their names
2. WHEN an Administrator selects a different node, THE System SHALL update all dashboard charts and metrics to reflect the selected node's data
3. THE System SHALL update the URL to include the selected node identifier for deep linking
4. WHEN an Administrator shares a URL with a node parameter, THE System SHALL load the dashboard with that node pre-selected
5. THE System SHALL display the currently selected node name prominently in the interface

### Requirement 6: End User Data Isolation

**User Story:** As an End User, I want to see only my organization's metrics so that I have a focused view of my company's performance.

#### Acceptance Criteria

1. WHEN an End User accesses the dashboard, THE System SHALL automatically filter all metrics to their associated node
2. THE System SHALL NOT display a node selector to End Users
3. THE System SHALL display the End User's company name in the top navigation bar
4. WHEN an End User attempts to access metrics for a different node via URL manipulation, THE System SHALL return an authorization error
5. THE System SHALL ensure End Users cannot infer other organizations' data through any interface element including filters, autocomplete, or aggregations

### Requirement 7: TRPC Authorization Middleware

**User Story:** As a developer, I want centralized authorization logic in TRPC so that all API endpoints are consistently protected.

#### Acceptance Criteria

1. THE System SHALL create an authenticated TRPC procedure that verifies user session existence
2. THE System SHALL create an admin-only TRPC procedure that verifies Administrator role
3. THE System SHALL inject user identity, role, and node association into the TRPC context
4. WHEN an unauthenticated request reaches a protected procedure, THE System SHALL return an UNAUTHORIZED error
5. WHEN a non-administrator request reaches an admin-only procedure, THE System SHALL return a FORBIDDEN error

### Requirement 8: Metrics Query with Authorization

**User Story:** As the system, I want to enforce data access rules at the database query level so that users can only retrieve authorized metrics.

#### Acceptance Criteria

1. WHEN an End User requests metrics, THE System SHALL automatically add a nodeId filter matching their associated node
2. WHEN an Administrator requests metrics without specifying a node, THE System SHALL return aggregated data from all nodes
3. WHEN an Administrator requests metrics for a specific node, THE System SHALL filter data to that node only
4. THE System SHALL validate node identifiers in requests against the list of existing nodes
5. THE System SHALL return an empty dataset with appropriate messaging when no metrics exist for the requested node

### Requirement 9: Dashboard UI Role Adaptation

**User Story:** As a user, I want the dashboard interface to adapt to my role so that I see only relevant controls and information.

#### Acceptance Criteria

1. WHEN an Administrator views the dashboard, THE System SHALL display the node selector dropdown in the top bar
2. WHEN an End User views the dashboard, THE System SHALL hide the node selector and display their company name as static text
3. THE System SHALL display a role indicator badge showing "Admin" or "User" in the user menu
4. THE System SHALL maintain consistent visual design between Administrator and End User views
5. THE System SHALL ensure all charts, filters, and controls respect the user's role and node context

### Requirement 10: Time Range Filtering

**User Story:** As a user, I want to filter metrics by date range so that I can analyze trends over specific time periods.

#### Acceptance Criteria

1. THE System SHALL provide a date range selector with preset options for last 7 days, 30 days, and 90 days
2. THE System SHALL allow users to select custom start and end dates
3. WHEN a user selects a date range, THE System SHALL filter all dashboard metrics to that time period
4. THE System SHALL display the currently selected date range prominently in the interface
5. THE System SHALL default to the last 30 days when a user first accesses the dashboard

### Requirement 11: Real-time Data Updates

**User Story:** As a user, I want the dashboard to automatically refresh so that I see current metrics without manual intervention.

#### Acceptance Criteria

1. THE System SHALL automatically refetch metrics data every 60 seconds
2. WHEN data is being refreshed, THE System SHALL display a subtle loading indicator
3. THE System SHALL maintain the user's current view and scroll position during automatic refreshes
4. THE System SHALL provide a manual refresh button for immediate data updates
5. WHEN a manual refresh is triggered, THE System SHALL disable the refresh button until the operation completes

### Requirement 12: Empty State and Error Handling

**User Story:** As a user, I want clear feedback when data is unavailable so that I understand the system status.

#### Acceptance Criteria

1. WHEN no metrics exist for the selected node and time range, THE System SHALL display a friendly "no data" message with guidance
2. WHEN a database connection error occurs, THE System SHALL display an error message with a retry action
3. WHEN an authorization error occurs, THE System SHALL display an appropriate error message without exposing security details
4. THE System SHALL log detailed error information server-side for debugging
5. THE System SHALL provide actionable next steps in all error messages

### Requirement 13: Performance Optimization

**User Story:** As a user, I want the dashboard to load quickly so that I can access metrics without delay.

#### Acceptance Criteria

1. THE System SHALL implement server-side data prefetching for the initial dashboard load
2. THE System SHALL cache metric queries on the client for 30 seconds using React Query
3. THE System SHALL use MongoDB aggregation pipelines for computing aggregate statistics
4. THE System SHALL limit result sets to 1000 documents per query with pagination for larger datasets
5. WHEN aggregating data across all nodes, THE System SHALL use database-level aggregation rather than client-side computation

### Requirement 15: Responsive Design

**User Story:** As a user, I want to access the dashboard on different devices so that I can view metrics on desktop, tablet, or mobile.

#### Acceptance Criteria

1. THE System SHALL render all dashboard components responsively using Tailwind CSS breakpoints
2. WHEN viewed on mobile devices, THE System SHALL collapse the sidebar into a hamburger menu
3. WHEN viewed on tablets, THE System SHALL stack charts vertically for optimal viewing
4. THE System SHALL ensure all interactive elements have touch-friendly sizes on mobile devices
5. THE System SHALL maintain full functionality across all supported screen sizes

### Requirement 16: Data Export

**User Story:** As a user, I want to export metrics data so that I can perform offline analysis or reporting.

#### Acceptance Criteria

1. THE System SHALL provide an export button on each dashboard view
2. WHEN a user clicks export, THE System SHALL generate a CSV file containing the currently displayed metrics
3. THE System SHALL include the node name, date range, and export timestamp in the CSV filename
4. THE System SHALL respect authorization rules when exporting data
5. THE System SHALL limit exports to 10,000 rows to prevent performance issues

### Requirement 17: Chart Visibility Customization

**User Story:** As a user, I want to show or hide specific charts so that I can focus on metrics relevant to my needs.

#### Acceptance Criteria

1. THE System SHALL maintain the existing chart visibility controls
2. THE System SHALL persist chart visibility preferences in browser local storage
3. WHEN a user toggles chart visibility, THE System SHALL immediately show or hide the corresponding chart
4. THE System SHALL provide a "Reset to Default" option to restore all charts to visible state
5. THE System SHALL apply visibility preferences consistently across all dashboard views

### Requirement 18: Node Management for Administrators

**User Story:** As an Administrator, I want to view a list of all nodes with basic statistics so that I can understand the platform landscape.

#### Acceptance Criteria

1. THE System SHALL provide a "Nodes" page accessible only to Administrators
2. THE System SHALL display a table listing all nodes with name, identifier, and last metric timestamp
3. THE System SHALL show the count of metrics documents for each node
4. THE System SHALL allow Administrators to click a node to navigate to its detailed dashboard
5. THE System SHALL display nodes sorted by most recent activity

### Requirement 19: User Profile and Settings

**User Story:** As a user, I want to view and update my profile information so that I can manage my account details.

#### Acceptance Criteria

1. THE System SHALL display user name and email in the user menu dropdown
2. THE System SHALL show the user's role (Administrator or End User) in the profile section
3. WHEN an End User views their profile, THE System SHALL display their associated company name
4. THE System SHALL provide a link to WorkOS account management for password and security settings
5. THE System SHALL display the user's last login timestamp

### Requirement 20: Environment Configuration

**User Story:** As a developer, I want environment variables properly validated so that deployment issues are caught early.

#### Acceptance Criteria

1. THE System SHALL validate all required WorkOS environment variables at build time using Zod schemas
2. THE System SHALL validate the MongoDB connection string format
3. WHEN required environment variables are missing, THE System SHALL fail the build with clear error messages
4. THE System SHALL use the existing @t3-oss/env-nextjs package for environment validation
5. THE System SHALL document all required environment variables in a .env.example file
