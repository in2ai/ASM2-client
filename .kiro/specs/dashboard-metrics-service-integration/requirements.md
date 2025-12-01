# Requirements Document

## Introduction

This document specifies the requirements for migrating the dashboard from a MongoDB-based architecture to a new architecture where the dashboard consumes data from the metrics_service backend via REST API. The migration removes multi-node support since all data now comes from a single local deployment, while preserving user authentication for tracking purposes.

## Glossary

- **Dashboard**: The Next.js frontend application that displays metrics and analytics
- **Metrics_Service**: The FastAPI backend service that provides metrics data from QuestDB
- **QuestDB**: The time-series database storing metrics, word counts, topic counts, user activity, and requests
- **tRPC**: The type-safe RPC framework currently used by the dashboard for API communication
- **Node**: A previously supported concept representing different deployment instances (being removed)
- **User Authentication**: WorkOS-based authentication system for tracking user access

## Requirements

### Requirement 1

**User Story:** As a developer, I want the dashboard to fetch metrics from the metrics_service REST API, so that the dashboard can display data from the new QuestDB-based backend.

#### Acceptance Criteria

1. WHEN the dashboard requests metrics data THEN the Dashboard SHALL call the metrics_service REST API endpoints instead of MongoDB
2. WHEN the metrics_service returns data THEN the Dashboard SHALL transform the response to match the expected UI data structures
3. WHEN the metrics_service is unavailable THEN the Dashboard SHALL display an appropriate error message to the user
4. WHEN date range filters are applied THEN the Dashboard SHALL pass start_date and end_date parameters to the metrics_service API

### Requirement 2

**User Story:** As a developer, I want to remove all MongoDB-related code from the dashboard, so that the codebase is simplified and only uses the new data source.

#### Acceptance Criteria

1. WHEN the migration is complete THEN the Dashboard SHALL have no MongoDB connection code
2. WHEN the migration is complete THEN the Dashboard SHALL have no Mongoose model definitions
3. WHEN the migration is complete THEN the Dashboard SHALL have no MongoDB-specific query logic in tRPC routers

### Requirement 3

**User Story:** As a developer, I want to remove all node-related functionality from the dashboard, so that the UI reflects the single-node local deployment architecture.

#### Acceptance Criteria

1. WHEN the migration is complete THEN the Dashboard SHALL have no node selection UI components
2. WHEN the migration is complete THEN the Dashboard SHALL have no node-related tRPC procedures (listNodes, getNodeSummary)
3. WHEN the migration is complete THEN the Dashboard SHALL have no admin nodes management page
4. WHEN the migration is complete THEN the Dashboard SHALL have no nodeId parameters in API calls

### Requirement 4

**User Story:** As a user, I want to continue using authentication to access the dashboard, so that my usage can be tracked.

#### Acceptance Criteria

1. WHEN a user accesses the dashboard THEN the Dashboard SHALL require WorkOS authentication
2. WHEN a user is authenticated THEN the Dashboard SHALL track the user_id for metrics queries
3. WHEN a user is not authenticated THEN the Dashboard SHALL redirect to the sign-in page

### Requirement 5

**User Story:** As a developer, I want to add the dashboard service to docker-compose.yml, so that the entire stack can be started together.

#### Acceptance Criteria

1. WHEN docker-compose up is executed THEN the Dashboard service SHALL start alongside other services
2. WHEN the dashboard service starts THEN the Dashboard SHALL be accessible on a configured port
3. WHEN the dashboard service starts THEN the Dashboard SHALL be able to communicate with the metrics_service

### Requirement 6

**User Story:** As a user, I want to view aggregated metrics from the new data structure, so that I can understand system usage patterns.

#### Acceptance Criteria

1. WHEN the dashboard displays metrics THEN the Dashboard SHALL show mean metric values from the metrics_service
2. WHEN the dashboard displays search analytics THEN the Dashboard SHALL show top search terms from the metrics_service
3. WHEN the dashboard displays session data THEN the Dashboard SHALL show mean session length from the metrics_service

### Requirement 7

**User Story:** As a developer, I want the tRPC routers to proxy requests to the metrics_service, so that the frontend API contract remains stable.

#### Acceptance Criteria

1. WHEN the metrics router receives a get request THEN the Router SHALL fetch data from metrics_service and transform it
2. WHEN the metrics router receives a getStats request THEN the Router SHALL aggregate data from metrics_service endpoints
3. WHEN the metrics router receives an exportMetrics request THEN the Router SHALL fetch and format data from metrics_service

### Requirement 8

**User Story:** As a developer, I want to simplify the user preferences model, so that node-related preferences are removed.

#### Acceptance Criteria

1. WHEN user preferences are saved THEN the Preferences model SHALL not include defaultNodeId field
2. WHEN user preferences are retrieved THEN the Preferences router SHALL not return node-related data
