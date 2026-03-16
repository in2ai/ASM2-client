# SPA Dashboard Migration Notes

## Summary

This repository now supports the dashboard as a TanStack Router SPA served by Caddy, with Logto authentication in the frontend and strict JWT validation in FastAPI.

The main goals implemented were:

- migrate the dashboard flow away from the legacy Next.js app for the SPA path
- protect backend metrics endpoints with Logto-issued bearer tokens
- request API tokens from the SPA for the backend API resource
- support automatic assignment of a default Logto user role through a backend-managed M2M flow
- deploy the SPA behind Caddy with `/api` reverse-proxied to FastAPI
- stabilize the SPA runtime after migration by fixing provider wiring and date-filter query propagation
- align the backend AI dependency stack with current LangChain and LangGraph-compatible package versions

## Important Changes Implemented

### Frontend SPA

- The dashboard now runs from `dashboard-ts-router` as a TanStack Router SPA.
- Logto React is initialized in the SPA with:
  - `VITE_LOGTO_ENDPOINT`
  - `VITE_LOGTO_APP_ID`
  - `VITE_LOGTO_API_RESOURCE`
- The SPA requests these API scopes from Logto:
  - `metrics:read`
  - `metrics:export`
- Sign-in redirects to `/callback`.
- Sign-out redirects to `/sign-in`.
- The callback route now performs a backend bootstrap request after sign-in.
- The SPA root is wrapped with `TooltipProvider` so tooltip consumers do not crash at runtime.
- The metrics date-range controls now propagate deterministically into React Query requests.
- Date presets were normalized to inclusive ranges and custom date selections are normalized before querying.

Key frontend files:

- `dashboard-ts-router/src/main.tsx`
- `dashboard-ts-router/src/lib/logto.ts`
- `dashboard-ts-router/src/lib/api.ts`
- `dashboard-ts-router/src/routes/sign-in.tsx`
- `dashboard-ts-router/src/routes/callback.tsx`
- `dashboard-ts-router/src/trpc/react.tsx`
- `dashboard-ts-router/src/components/date-range-selector.tsx`
- `dashboard-ts-router/src/app/_components/metrics-dashboard.tsx`
- `dashboard-ts-router/vite.config.ts`

### Backend Auth and API Protection

- FastAPI validates Logto bearer tokens using:
  - OpenID configuration from `LOGTO_ENDPOINT`
  - JWKS from the Logto issuer
  - audience validation using `LOGTO_API_RESOURCE`
  - scope validation per protected route
- Metrics routes require:
  - `metrics:read` for dashboard and stats
  - `metrics:export` for export
- Legacy raw-token route parameters were replaced with bearer-token dependencies for the migrated backend auth flow.
- The insecure admin fallback was removed.
- JWT verification no longer hard-codes `RS256`; it now supports Logto asymmetric signing algorithms safely.

Key backend files:

- `backend/src/config/logto_auth.py`
- `backend/server.py`
- `backend/src/config/auth.py`

### Automatic Default Role Assignment

- A Logto Management API client was added on the backend.
- A new backend endpoint `POST /auth/bootstrap` was added.
- After sign-in, the SPA callback calls this endpoint once.
- The backend can automatically assign a default global role to a newly authenticated user if the M2M configuration is present.
- After bootstrap, the SPA re-requests the API token so the token can include the new scopes granted by the assigned role.

Key backend file:

- `backend/src/config/logto_management.py`

### Deployment and Networking

- The SPA deployment path is now Caddy-based.
- `dashboard-ts-router/Dockerfile.caddy` builds the SPA and serves it with Caddy.
- `dashboard-ts-router/Caddyfile` serves static files and proxies `/api/*` to `backend:8000`.
- `docker-compose.dashboard-spa.yml` keeps the backend internal to the Docker network using `expose` instead of host `ports`.
- Health checks were added for both the backend and the dashboard.
- A backend readiness endpoint `GET /healthz` was added.

Key deployment files:

- `docker-compose.dashboard-spa.yml`
- `dashboard-ts-router/Dockerfile.caddy`
- `dashboard-ts-router/Caddyfile`
- `dashboard-ts-router/README.md`

### AI Dependency Alignment

- The backend AI package pins were upgraded to a coherent modern stack so Docker builds resolve cleanly again.
- Backend code was updated to follow the current split package layout used by LangChain 1.x.
- The backend Docker image builds successfully with the aligned dependency set.

Key dependency files:

- `backend/pyproject.toml`
- `backend/uv.lock`
- `requirements.txt`
- `backend/graph/tools.py`
- `backend/graph/model.py`

## Logto Configuration Model

There are now three separate Logto concepts in play.

### 1. SPA Application

This is the frontend application used by the browser.

Used by:

- `LOGTO_APP_ID`
- `VITE_LOGTO_APP_ID`

Typical Logto console setup:

- Application type: `Single page app`
- Redirect URI examples:
  - `http://localhost:3000/callback`
  - `http://localhost:3001/callback`
  - `https://your-internal-host/callback`
- Post sign-out redirect URI examples:
  - `http://localhost:3000/sign-in`
  - `http://localhost:3001/sign-in`
  - `https://your-internal-host/sign-in`
- Allowed origins examples:
  - `http://localhost:3000`
  - `http://localhost:3001`
  - `https://your-internal-host`

### 2. Backend API Resource

This is the FastAPI audience identifier.

Used by:

- `LOGTO_API_RESOURCE`
- `VITE_LOGTO_API_RESOURCE`

Important note:

- this is an identity string for the backend API
- it must match exactly across Logto, frontend token requests, and backend audience validation
- it is not the same thing as a route like `/api` or `/metrics/dashboard`

Example values:

- `https://asm2-api.company.internal`
- `https://api.asm2.local`
- `urn:asm2:backend`

### 3. Logto Management API Resource

This is only for the backend M2M application that assigns roles.

Used by:

- `LOGTO_MANAGEMENT_API_RESOURCE`

Important note:

- this is not your FastAPI API resource
- it should not be the same value as `LOGTO_API_RESOURCE`
- for the documented self-hosted Logto management flow, the expected value is typically:
  - `https://default.logto.app/api`

## Backend Environment Variables

### Required for backend auth

```env
LOGTO_ENDPOINT=https://your-logto-host
LOGTO_API_RESOURCE=https://asm2-api.company.internal
```

### Optional, required only for automatic default-role assignment

```env
LOGTO_MANAGEMENT_APP_ID=your_m2m_app_id
LOGTO_MANAGEMENT_APP_SECRET=your_m2m_app_secret
LOGTO_MANAGEMENT_API_RESOURCE=https://default.logto.app/api
LOGTO_DEFAULT_USER_ROLE_ID=your_logto_role_id
```

## SPA Environment Variables

### Logical values the SPA needs

```env
LOGTO_ENDPOINT=https://your-logto-host
LOGTO_APP_ID=your_spa_app_id
LOGTO_API_RESOURCE=https://asm2-api.company.internal
BACKEND_URL=/api
```

### Notes

- `dashboard-ts-router/vite.config.ts` maps shared root env values into `VITE_*` variables for the browser bundle.
- runtime frontend code reads the normalized `VITE_*` values.
- in production SPA deployment, `BACKEND_URL` or `VITE_BACKEND_URL` should typically be `/api`.
- locally, the SPA has also been run against `BACKEND_URL=http://localhost:8000` when the FastAPI app runs outside Docker.

## Required Logto Permissions and Roles

The backend currently expects these API scopes:

- `metrics:read`
- `metrics:export`

These must exist on the backend API resource in Logto.

Recommended role setup:

- `user`
  - `metrics:read`
- `admin`
  - `metrics:read`
  - `metrics:export`

If all users should be allowed to export, then `metrics:export` can also be attached to the standard user role.

## Operational Caveats

### Default-role bootstrap timing

Automatic role assignment happens after a user has already completed sign-in.

This means:

- the callback route performs a bootstrap request after login
- the backend assigns the default role if missing
- the SPA then re-fetches the API token
- the new token can include the scopes that come from the assigned role

If the M2M role assignment is not configured, the bootstrap endpoint returns a disabled state and the app continues without role auto-assignment.

### Environment file formatting

- backend env parsing assumes plain values, not shell-style quoted strings for URLs or integers.
- values such as `QUESTDB_PORT="8812"` or `LOGTO_ENDPOINT="https://..."` caused runtime failures during local testing.
- the problematic failures observed were:
  - `int(...)` parsing errors for QuestDB port values
  - invalid requests URL construction for OpenID discovery when `LOGTO_ENDPOINT` included literal quotes
- when using Doppler-generated or copied env files, confirm the effective values consumed by the backend do not include extra quote characters.

### Internal network and VPN use

- `LOGTO_ENDPOINT` must be a URL reachable by the browser and development machine.
- `LOGTO_API_RESOURCE` does not need to be a real DNS target if used only as an audience identifier.
- if you choose a DNS-style identifier, it only needs actual DNS support if you also want to use it as a real hostname.

### Caddy deployment behavior

- public users connect to the dashboard via Caddy
- Caddy serves the SPA and proxies `/api/*` to the backend
- backend host exposure was removed from the SPA compose override

### Dashboard filter behavior

- the metrics dashboard date filter is held in SPA state and passed into both dashboard and stats queries.
- the request cache key now uses serialized query params instead of raw `Date` objects so filter changes always trigger the correct refetch.
- preset filters now behave as inclusive windows:
  - `Last 7 days`
  - `Last 30 days`
  - `Last 90 days`
- custom date picks are normalized to day start and day end before reaching the query layer.

## Things To Check Before Running

### Logto SPA application

- correct app type: `Single page app`
- callback URI matches actual origin plus `/callback`
- post sign-out redirect matches actual origin plus `/sign-in`
- allowed origins include the actual frontend origin

### Logto backend API resource

- resource identifier matches `LOGTO_API_RESOURCE`
- permissions exist:
  - `metrics:read`
  - `metrics:export`
- users or roles actually receive those permissions

### Logto M2M bootstrap setup

- M2M app exists
- M2M app has Logto Management API access
- `LOGTO_DEFAULT_USER_ROLE_ID` is the correct global role ID

### Frontend and backend alignment

- `LOGTO_ENDPOINT` matches the same tenant for SPA and backend
- `LOGTO_API_RESOURCE` is exactly identical in frontend, backend, and Logto
- if local browser auth works but backend auth fails immediately on discovery, inspect the effective backend value of `LOGTO_ENDPOINT` first

## Validation Status

- `dashboard-ts-router` production build succeeds after the date-filter and runtime fixes.
- Backend Docker dependency resolution succeeds with the aligned LangChain package set.
- The dashboard runtime no longer depends on missing tooltip provider context.
- `BACKEND_URL` is correct for the selected runtime mode

### Local development

- frontend origin is allowed by Logto
- backend origin is allowed by FastAPI CORS when not using `/api` proxy mode
- callback and sign-out URLs are configured for the dev port in use

## Recommended First Test Flow

1. Sign in with a brand-new user.
2. Confirm the browser returns from `/callback` into the dashboard.
3. Confirm the backend bootstrap request succeeds.
4. Confirm metrics dashboard data loads.
5. Confirm export works only for users that have `metrics:export`.
6. Sign out and sign in again if needed to verify the role/scopes are stable across sessions.

## Current Known Limitations

- `backend/server.py` still contains several unrelated pre-existing lint/type issues outside this migration work.
- some old backend helper code still uses legacy patterns unrelated to the new auth path.
- the current setup assumes Logto role assignment is eventually reflected in refreshed tokens after callback bootstrap.

## Files Most Relevant To This Migration

- `backend/src/config/logto_auth.py`
- `backend/src/config/logto_management.py`
- `backend/src/config/auth.py`
- `backend/server.py`
- `dashboard-ts-router/src/lib/logto.ts`
- `dashboard-ts-router/src/lib/api.ts`
- `dashboard-ts-router/src/routes/sign-in.tsx`
- `dashboard-ts-router/src/routes/callback.tsx`
- `dashboard-ts-router/src/trpc/react.tsx`
- `dashboard-ts-router/vite.config.ts`
- `dashboard-ts-router/Dockerfile.caddy`
- `dashboard-ts-router/Caddyfile`
- `docker-compose.dashboard-spa.yml`
- `.env.example`
