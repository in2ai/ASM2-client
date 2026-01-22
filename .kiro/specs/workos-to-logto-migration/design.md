# Design Document: WorkOS to Logto Migration

## Overview

This design describes the migration of the dashboard authentication system from WorkOS AuthKit to Logto self-hosted. The migration involves:

1. Adding Logto and PostgreSQL services to Docker Compose
2. Replacing the `@workos-inc/authkit-nextjs` package with `@logto/next`
3. Updating middleware, sign-in/sign-out flows, and user context handling
4. Configuring environment variables for Logto

The architecture maintains the same authentication patterns (middleware-based route protection, server actions for sign-out) while leveraging Logto's richer organization and role scopes for enterprise SSO data extraction.

## Architecture

```mermaid
graph TB
    subgraph "Docker Compose Stack"
        subgraph "Logto Services"
            LC[Logto Core<br/>:3001]
            LA[Logto Admin Console<br/>:3002]
            PG[(PostgreSQL<br/>logto_db)]
        end
        
        subgraph "Dashboard"
            MW[Middleware]
            SI[Sign-In Page]
            CB[Callback Handler]
            AL[App Layout]
            SA[Server Actions]
        end
        
        QDB[(QuestDB)]
    end
    
    User((User)) --> MW
    MW -->|Protected| AL
    MW -->|Unauthenticated| SI
    SI -->|Redirect| LC
    LC -->|OAuth Callback| CB
    CB -->|Set Session| AL
    SA -->|Sign Out| LC
    
    LC --> PG
    LA --> PG
    AL --> QDB
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as Dashboard
    participant M as Middleware
    participant L as Logto
    participant SSO as Enterprise SSO
    
    U->>D: Access protected route
    M->>M: Check session (getLogtoContext)
    alt No valid session
        M->>U: Redirect to /sign-in
        U->>D: Click sign-in
        D->>L: Redirect to authorization
        L->>SSO: Federated login (if configured)
        SSO->>L: Return user + claims
        L->>D: Callback with code
        D->>D: handleSignIn (exchange code)
        D->>U: Redirect to original route
    else Valid session
        M->>D: Allow access
        D->>U: Render page
    end
```

## Components and Interfaces

### 1. Logto Configuration (`dashboard/src/lib/logto.ts`)

Centralized configuration for Logto SDK:

```typescript
import { LogtoNextConfig } from '@logto/next';

export const logtoConfig: LogtoNextConfig = {
  endpoint: process.env.LOGTO_ENDPOINT!,
  appId: process.env.LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  cookieSecret: process.env.LOGTO_COOKIE_SECRET!,
  cookieSecure: process.env.NODE_ENV === 'production',
  scopes: [
    'openid',
    'profile', 
    'email',
    'custom_data',
    'identities',
    'urn:logto:scope:organizations',
    'urn:logto:scope:organization_roles',
  ],
  resources: [],
};
```

### 2. Callback Route Handler (`dashboard/src/app/api/logto/[action]/route.ts`)

Dynamic route handler for Logto actions (sign-in, sign-out, callback):

```typescript
import { handleSignIn, handleSignOut, handleSignInCallback } from '@logto/next/server-actions';
import { logtoConfig } from '@/lib/logto';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { action: string } }
) {
  const { action } = params;
  
  switch (action) {
    case 'sign-in':
      await handleSignIn(logtoConfig);
      break;
    case 'sign-out':
      await handleSignOut(logtoConfig);
      break;
    case 'callback':
      await handleSignInCallback(logtoConfig);
      redirect('/');
      break;
    default:
      return new Response('Not Found', { status: 404 });
  }
}
```

### 3. Middleware (`dashboard/src/middleware.ts`)

Route protection using Logto context:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '@/lib/logto';

const publicPaths = [
  '/sign-in',
  '/api/logto/sign-in',
  '/api/logto/sign-out', 
  '/api/logto/callback',
  '/api/health',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }
  
  // Check authentication
  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  
  if (!isAuthenticated) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(signInUrl);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

### 4. Sign-In Page (`dashboard/src/app/sign-in/page.tsx`)

Updated to use Logto sign-in:

```typescript
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '@/lib/logto';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);
  
  if (isAuthenticated) {
    const { returnTo } = await searchParams;
    const safeReturnTo = returnTo?.startsWith('/') && !returnTo.startsWith('//') 
      ? returnTo 
      : '/';
    redirect(safeReturnTo);
  }
  
  return (
    // ... UI with Link to /api/logto/sign-in
  );
}
```

### 5. Sign-Out Action (`dashboard/src/app/actions/auth.ts`)

Server action for sign-out:

```typescript
'use server';

import { redirect } from 'next/navigation';

export async function signOutAction() {
  redirect('/api/logto/sign-out');
}
```

### 6. User Context Hook/Helper

Helper to get user information from Logto context:

```typescript
// dashboard/src/lib/auth.ts
import { getLogtoContext } from '@logto/next/server-actions';
import { logtoConfig } from '@/lib/logto';

export interface LogtoUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}

export async function getUser(): Promise<LogtoUser | null> {
  const context = await getLogtoContext(logtoConfig, {
    fetchUserInfo: true,
  });
  
  if (!context.isAuthenticated || !context.userInfo) {
    return null;
  }
  
  const { userInfo, claims } = context;
  
  // Extract organization info from claims
  const organizations = claims?.organizations as string[] | undefined;
  const organizationRoles = claims?.organization_roles as string[] | undefined;
  
  // Parse name from userInfo
  const nameParts = userInfo.name?.split(' ') ?? [];
  
  return {
    firstName: nameParts[0] ?? null,
    lastName: nameParts.slice(1).join(' ') || null,
    email: userInfo.email ?? null,
    role: organizationRoles?.[0]?.split(':')[1] ?? 'user', // Format: "org_id:role"
    organizationId: organizations?.[0] ?? null,
  };
}
```

### 7. App Layout Integration

The `AppLayout` component needs to receive user data as a prop (server-side fetched) instead of using a client-side hook:

```typescript
// In page.tsx (server component)
import { getUser } from '@/lib/auth';
import { AppLayout } from './_components/app-layout';

export default async function DashboardPage() {
  const user = await getUser();
  return <AppLayout user={user}>{/* ... */}</AppLayout>;
}
```

## Data Models

### LogtoUser Interface

```typescript
interface LogtoUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  organizationId?: string | null;
}
```

This interface maintains backward compatibility with the existing `WorkOSUser` interface used in `app-layout.tsx`.

### Logto UserInfo (from SDK)

```typescript
// From @logto/next
interface UserInfoResponse {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  custom_data?: Record<string, unknown>;
  identities?: Record<string, unknown>;
  organizations?: string[];
  organization_roles?: string[];
}
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `LOGTO_ENDPOINT` | Logto server URL | `http://logto:3001` |
| `LOGTO_APP_ID` | Application ID from Logto console | `abc123` |
| `LOGTO_APP_SECRET` | Application secret | `secret_xyz` |
| `LOGTO_COOKIE_SECRET` | Session encryption key (32+ chars) | `your-32-char-secret...` |
| `NEXT_PUBLIC_APP_URL` | Dashboard public URL | `http://localhost:3001` |

### Docker Compose Services

```yaml
# New services to add
logto-db:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: logto
    POSTGRES_USER: logto
    POSTGRES_PASSWORD: ${LOGTO_DB_PASSWORD}
  volumes:
    - logto_postgres_data:/var/lib/postgresql/data

logto:
  image: ghcr.io/logto-io/logto:latest
  depends_on:
    - logto-db
  ports:
    - "3002:3002"  # Admin console only (core accessed internally)
  environment:
    TRUST_PROXY_HEADER: "1"
    DB_URL: postgres://logto:${LOGTO_DB_PASSWORD}@logto-db:5432/logto
    ENDPOINT: http://logto:3001
    ADMIN_ENDPOINT: http://localhost:3002
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Scope Configuration Completeness

*For any* valid Logto configuration object, the scopes array SHALL contain all required scopes: 'openid', 'profile', 'email', 'custom_data', 'urn:logto:scope:organizations', and 'urn:logto:scope:organization_roles'.

**Validates: Requirements 2.2**

### Property 2: Protected Route Redirect

*For any* request to a protected route (not in the public paths list) with an unauthenticated session, the middleware SHALL return a redirect response to the sign-in page with the original path as a `returnTo` parameter.

**Validates: Requirements 3.1**

### Property 3: Public Path Access

*For any* request to a public path (`/sign-in`, `/api/logto/*`, `/api/health`), regardless of authentication status, the middleware SHALL allow the request to proceed without redirect.

**Validates: Requirements 3.2**

### Property 4: Authenticated User Sign-In Redirect

*For any* authenticated user visiting the sign-in page with a valid `returnTo` parameter (starting with `/` but not `//`), the system SHALL redirect to that path. For invalid or missing `returnTo`, the system SHALL redirect to `/`.

**Validates: Requirements 4.3**

### Property 5: User Data Rendering Completeness

*For any* authenticated user context with available data, the `getUser()` function SHALL return an object containing `firstName`, `lastName`, `email`, `role`, and `organizationId` fields, with appropriate fallbacks for missing data.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.4**

### Property 6: Cookie Secret Validation

*For any* string provided as `LOGTO_COOKIE_SECRET` with length less than 32 characters, the environment validation SHALL reject it with an appropriate error message.

**Validates: Requirements 8.4**

## Error Handling

### Authentication Errors

| Error Scenario | Handling |
|----------------|----------|
| Invalid/expired session | Redirect to `/sign-in` with `returnTo` parameter |
| Callback processing failure | Redirect to `/sign-in` (Logto SDK handles error state) |
| Missing Logto configuration | Application fails to start with validation error |
| Network error to Logto | Display error page, allow retry |

### Environment Validation Errors

The `env.js` file uses Zod schemas to validate environment variables at build/startup time:

```typescript
// Validation errors will prevent application startup
LOGTO_ENDPOINT: z.string().url(),
LOGTO_APP_ID: z.string().min(1),
LOGTO_APP_SECRET: z.string().min(1),
LOGTO_COOKIE_SECRET: z.string().min(32, {
  error: "LOGTO_COOKIE_SECRET must be at least 32 characters"
}),
```

### User Data Fallbacks

When user information is incomplete:
- `firstName`/`lastName`: Falls back to parsing `name` field, then `null`
- `email`: Falls back to `null`, UI shows placeholder
- `role`: Falls back to `'user'` if no organization roles
- `organizationId`: Falls back to `null`, UI hides organization display

## Testing Strategy

### Unit Tests

Unit tests verify specific examples and edge cases:

1. **Logto Configuration**
   - Verify config object has all required fields
   - Verify scopes array contains required scopes

2. **User Data Extraction**
   - Test `getUser()` with complete user info
   - Test `getUser()` with partial user info (missing name, email)
   - Test `getUser()` with organization data
   - Test `getUser()` with no organization data

3. **Environment Validation**
   - Test valid environment variables pass validation
   - Test missing required variables fail validation
   - Test short cookie secret fails validation

4. **Sign-In Page Logic**
   - Test redirect for authenticated users
   - Test safe `returnTo` parameter handling
   - Test rejection of unsafe `returnTo` values (e.g., `//evil.com`)

### Property-Based Tests

Property-based tests verify universal properties across generated inputs. Each test runs minimum 100 iterations.

1. **Property 1: Scope Configuration Completeness**
   - Tag: `Feature: workos-to-logto-migration, Property 1: Scope configuration completeness`
   - Generate variations of config objects, verify required scopes present

2. **Property 2: Protected Route Redirect**
   - Tag: `Feature: workos-to-logto-migration, Property 2: Protected route redirect`
   - Generate random protected paths, verify redirect behavior

3. **Property 3: Public Path Access**
   - Tag: `Feature: workos-to-logto-migration, Property 3: Public path access`
   - Generate random public paths with/without auth, verify no redirect

4. **Property 4: Authenticated User Sign-In Redirect**
   - Tag: `Feature: workos-to-logto-migration, Property 4: Authenticated user sign-in redirect`
   - Generate random `returnTo` values, verify safe redirect logic

5. **Property 5: User Data Rendering Completeness**
   - Tag: `Feature: workos-to-logto-migration, Property 5: User data rendering completeness`
   - Generate random Logto user info objects, verify output structure

6. **Property 6: Cookie Secret Validation**
   - Tag: `Feature: workos-to-logto-migration, Property 6: Cookie secret validation`
   - Generate random strings of various lengths, verify validation behavior

### Integration Tests

Integration tests verify end-to-end flows:

1. **Sign-In Flow**: Verify redirect to Logto and callback handling
2. **Sign-Out Flow**: Verify session termination and redirect
3. **Protected Route Access**: Verify middleware blocks unauthenticated access
4. **Docker Compose**: Verify all services start and communicate

### Testing Library

Use `fast-check` for property-based testing in TypeScript/JavaScript:

```typescript
import fc from 'fast-check';

// Example: Property 4 - returnTo validation
fc.assert(
  fc.property(fc.string(), (returnTo) => {
    const result = getSafeReturnTo(returnTo);
    // Safe returnTo starts with / but not //
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      return result === returnTo;
    }
    return result === '/';
  }),
  { numRuns: 100 }
);
```
