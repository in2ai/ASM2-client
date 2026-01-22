# Implementation Plan: WorkOS to Logto Migration

## Overview

This plan migrates the dashboard authentication from WorkOS AuthKit to Logto self-hosted. Tasks are ordered to ensure incremental progress with early validation of core functionality.

## Tasks

- [x] 1. Update Docker Compose with Logto services
  - [x] 1.1 Add PostgreSQL service for Logto database
    - Add `logto-db` service with postgres:15-alpine image
    - Configure environment variables for database credentials
    - Add volume for data persistence
    - _Requirements: 1.3_
  
  - [x] 1.2 Add Logto service
    - Add `logto` service with `ghcr.io/logto-io/logto:latest` image
    - Configure `DB_URL`, `ENDPOINT`, `ADMIN_ENDPOINT`, `TRUST_PROXY_HEADER`
    - Expose port 3002 for admin console
    - Add dependency on `logto-db`
    - _Requirements: 1.1, 1.2_
  
  - [x] 1.3 Update dashboard service configuration
    - Remove WorkOS build args
    - Add Logto environment variables
    - Add dependency on `logto` service
    - _Requirements: 1.4, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Update dashboard dependencies and environment
  - [x] 2.1 Update package.json
    - Remove `@workos-inc/authkit-nextjs` dependency
    - Add `@logto/next` dependency
    - _Requirements: 2.1_
  
  - [x] 2.2 Update environment validation (env.js)
    - Remove WorkOS environment variable schemas
    - Add Logto environment variable schemas with validation
    - Keep `NEXT_PUBLIC_APP_URL` (shared)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [ ]* 2.3 Write property test for cookie secret validation
    - **Property 6: Cookie Secret Validation**
    - Test that strings under 32 characters are rejected
    - **Validates: Requirements 8.4**

- [x] 3. Create Logto configuration and auth utilities
  - [x] 3.1 Create Logto configuration file (lib/logto.ts)
    - Export `logtoConfig` with endpoint, appId, appSecret, baseUrl, cookieSecret
    - Configure scopes for profile, email, custom_data, organizations, organization_roles
    - _Requirements: 2.2, 2.3_
  
  - [ ]* 3.2 Write property test for scope configuration
    - **Property 1: Scope Configuration Completeness**
    - Verify all required scopes are present in config
    - **Validates: Requirements 2.2**
  
  - [x] 3.3 Create user context helper (lib/auth.ts)
    - Implement `getUser()` function using `getLogtoContext`
    - Map Logto userInfo to LogtoUser interface (firstName, lastName, email, role, organizationId)
    - Handle missing data with appropriate fallbacks
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.4_
  
  - [ ]* 3.4 Write property test for user data extraction
    - **Property 5: User Data Rendering Completeness**
    - Generate random Logto user info, verify output structure
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.4**

- [x] 4. Checkpoint - Verify configuration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Logto route handlers
  - [x] 5.1 Create callback route handler (api/logto/[action]/route.ts)
    - Handle `sign-in` action with `handleSignIn`
    - Handle `sign-out` action with `handleSignOut`
    - Handle `callback` action with `handleSignInCallback`
    - Return 404 for unknown actions
    - _Requirements: 4.1, 4.2, 4.4, 5.1, 5.2, 5.3_

- [x] 6. Update middleware for route protection
  - [x] 6.1 Replace WorkOS middleware with Logto middleware
    - Import `getLogtoContext` from `@logto/next/server-actions`
    - Define public paths array
    - Check authentication and redirect unauthenticated users
    - Preserve `returnTo` parameter in redirect
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ]* 6.2 Write property test for protected route redirect
    - **Property 2: Protected Route Redirect**
    - Generate random protected paths, verify redirect behavior
    - **Validates: Requirements 3.1**
  
  - [ ]* 6.3 Write property test for public path access
    - **Property 3: Public Path Access**
    - Generate random public paths, verify no redirect
    - **Validates: Requirements 3.2**

- [x] 7. Update sign-in page
  - [x] 7.1 Replace WorkOS auth with Logto
    - Replace `withAuth` with `getLogtoContext`
    - Replace `getSignInUrl` with link to `/api/logto/sign-in`
    - Preserve safe `returnTo` redirect logic
    - _Requirements: 4.1, 4.3_
  
  - [ ]* 7.2 Write property test for returnTo validation
    - **Property 4: Authenticated User Sign-In Redirect**
    - Generate random returnTo values, verify safe redirect logic
    - **Validates: Requirements 4.3**

- [x] 8. Update sign-out action
  - [x] 8.1 Replace WorkOS signOut with Logto redirect
    - Update `signOutAction` to redirect to `/api/logto/sign-out`
    - _Requirements: 5.1, 5.2_

- [x] 9. Update app layout for user display
  - [x] 9.1 Remove WorkOS useAuth hook
    - Remove import of `useAuth` from `@workos-inc/authkit-nextjs/components`
    - Update `AppLayout` to receive `user` as prop instead of using hook
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [x] 9.2 Update page components to pass user prop
    - Fetch user with `getUser()` in server components
    - Pass user to `AppLayout` as prop
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Checkpoint - Verify authentication flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Final cleanup
  - [x] 11.1 Remove unused WorkOS imports and types
    - Clean up any remaining WorkOS references
    - Update TypeScript types if needed
    - _Requirements: 2.1_
  
  - [ ]* 11.2 Write integration tests for auth flows
    - Test sign-in redirect flow
    - Test sign-out flow
    - Test protected route access
    - _Requirements: 3.1, 4.1, 4.2, 5.1, 5.2_

- [x] 12. Final checkpoint - Full verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The dashboard port remains 3001; Logto admin console uses 3002
- After completing tasks, configure Logto via admin console (create application, set up SSO connectors)
