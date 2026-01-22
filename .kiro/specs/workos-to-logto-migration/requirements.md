# Requirements Document

## Introduction

This document specifies the requirements for migrating the dashboard authentication system from WorkOS AuthKit to Logto self-hosted. The migration aims to maintain equivalent authentication functionality while enabling richer user information extraction from enterprise SSO providers (role, permissions, department, etc.) through Logto's organization and custom data scopes.

## Glossary

- **Dashboard**: The Next.js application located in `dashboard/` that provides metrics visualization
- **Logto**: Self-hosted open-source authentication platform replacing WorkOS
- **Logto_Admin_Console**: Web interface on port 3002 for configuring Logto applications and connectors
- **Logto_Core**: Main Logto service on port 3001 handling authentication flows
- **SSO_Connector**: Enterprise identity provider integration (SAML/OIDC) configured in Logto
- **Organization**: Logto concept for grouping users with shared roles and permissions
- **User_Context**: Authentication state containing user profile, roles, and organization data
- **Callback_Handler**: API route that processes OAuth redirect responses from Logto

## Requirements

### Requirement 1: Logto Infrastructure Setup

**User Story:** As a system administrator, I want Logto deployed via Docker Compose, so that I have a self-hosted authentication service for the dashboard.

#### Acceptance Criteria

1. WHEN docker-compose is executed, THE Logto_Core SHALL start on port 3001 with PostgreSQL database connectivity
2. WHEN docker-compose is executed, THE Logto_Admin_Console SHALL be accessible on port 3002 for configuration
3. WHEN Logto services start, THE system SHALL create and use a dedicated PostgreSQL database for Logto data
4. WHEN the dashboard service starts, THE system SHALL have network connectivity to Logto_Core for authentication requests

### Requirement 2: Authentication Package Migration

**User Story:** As a developer, I want the dashboard to use Logto SDK instead of WorkOS, so that authentication flows work with the new provider.

#### Acceptance Criteria

1. WHEN the dashboard is built, THE system SHALL use `@logto/next` package instead of `@workos-inc/authkit-nextjs`
2. WHEN Logto is configured, THE system SHALL request scopes for profile, email, custom_data, organizations, and organization_roles
3. THE Logto_Configuration SHALL be centralized in a single configuration file at `dashboard/src/lib/logto.ts`

### Requirement 3: Route Protection

**User Story:** As a user, I want protected routes to require authentication, so that unauthorized access is prevented.

#### Acceptance Criteria

1. WHEN an unauthenticated user accesses a protected route, THE system SHALL redirect them to the sign-in page
2. WHEN a user accesses `/sign-in`, `/api/logto/sign-in`, `/api/logto/sign-out`, `/api/logto/callback`, or `/api/health`, THE system SHALL allow access without authentication
3. WHEN middleware checks authentication, THE system SHALL verify the session using Logto's `getLogtoContext`

### Requirement 4: Sign-In Flow

**User Story:** As a user, I want to sign in through Logto, so that I can access the dashboard with my corporate credentials.

#### Acceptance Criteria

1. WHEN a user clicks the sign-in button, THE system SHALL redirect to Logto's authorization endpoint
2. WHEN Logto completes authentication, THE system SHALL handle the callback at `/api/logto/callback`
3. WHEN an authenticated user visits the sign-in page, THE system SHALL redirect them to the dashboard
4. IF the callback processing fails, THEN THE system SHALL redirect to sign-in with an error indication

### Requirement 5: Sign-Out Flow

**User Story:** As a user, I want to sign out from the dashboard, so that my session is terminated securely.

#### Acceptance Criteria

1. WHEN a user triggers sign-out, THE system SHALL call Logto's sign-out endpoint
2. WHEN sign-out completes, THE system SHALL redirect the user to the sign-in page
3. WHEN sign-out is processed, THE system SHALL clear all session cookies

### Requirement 6: User Information Display

**User Story:** As a user, I want to see my profile information in the dashboard, so that I know I'm logged in with the correct account.

#### Acceptance Criteria

1. WHEN a user is authenticated, THE system SHALL display the user's email in the header
2. WHEN a user is authenticated, THE system SHALL display the user's name (or email fallback) in the user menu
3. WHEN a user is authenticated, THE system SHALL display the user's role badge (admin or user)
4. WHEN organization data is available, THE system SHALL display the organization identifier

### Requirement 7: Enterprise SSO Data Extraction

**User Story:** As an administrator, I want to capture rich user data from enterprise SSO providers, so that I can leverage corporate directory information.

#### Acceptance Criteria

1. WHEN a user authenticates via enterprise SSO, THE system SHALL request organization scopes to retrieve organizational membership
2. WHEN a user authenticates via enterprise SSO, THE system SHALL request organization_roles scope to retrieve role assignments
3. WHEN custom claims are available from the SSO provider, THE system SHALL store them in Logto's custom_data field
4. THE User_Context SHALL include firstName, lastName, email, role, and organizationId fields for backward compatibility

### Requirement 8: Environment Configuration

**User Story:** As a developer, I want clear environment variable configuration, so that I can deploy the system in different environments.

#### Acceptance Criteria

1. THE system SHALL require `LOGTO_ENDPOINT` environment variable for the Logto server URL
2. THE system SHALL require `LOGTO_APP_ID` environment variable for the application identifier
3. THE system SHALL require `LOGTO_APP_SECRET` environment variable for the application secret
4. THE system SHALL require `LOGTO_COOKIE_SECRET` environment variable (minimum 32 characters) for session encryption
5. THE system SHALL use `NEXT_PUBLIC_APP_URL` for constructing callback URLs
6. WHEN WorkOS environment variables are present, THE system SHALL ignore them (backward compatibility during transition)
