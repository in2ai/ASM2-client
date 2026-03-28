# Logto Self-Hosted Setup For The SPA + FastAPI Architecture

This guide documents the current Logto setup for ASM2 using:

- `dashboard-ts-router` as a browser SPA
- `backend/server.py` as the protected FastAPI API
- an optional Logto machine-to-machine client for default global user role bootstrap

The old Next.js-only flow is no longer the primary architecture for the dashboard path.

## 1. Architecture Overview

There are three separate Logto concepts in the current setup.

### SPA application

This is the browser app used by `dashboard-ts-router`.

It is responsible for:

- redirecting users to Logto sign-in
- handling the `/callback` route after login
- requesting access tokens for the backend API resource

Relevant frontend files:

- `dashboard-ts-router/src/lib/logto.ts`
- `dashboard-ts-router/src/routes/sign-in.tsx`
- `dashboard-ts-router/src/routes/callback.tsx`
- `dashboard-ts-router/src/lib/api.ts`

### Backend API resource

This is the protected audience identifier used by FastAPI.

It is responsible for:

- audience validation in backend JWT checks
- carrying API permissions such as `metrics:read` and `metrics:export`

Relevant backend files:

- `backend/src/config/logto_auth.py`
- `backend/server.py`

### Optional machine-to-machine application

This is only needed if you want the backend to auto-assign a default global user role after first sign-in.

It is responsible for:

- obtaining a management API token with client credentials
- assigning the configured default role to a user through the Logto Management API

Relevant backend files:

- `backend/src/config/logto_management.py`
- `backend/server.py`

## 2. Self-Hosted Docker Setup

The repository includes a self-hosted Logto service and a dedicated PostgreSQL database in `docker-compose.yml`.

Current container mapping:

- host `3011` -> Logto main endpoint `3001`
- host `3002` -> Logto admin console `3002`

Required root `.env` values for the Logto containers:

```env
LOGTO_POSTGRES_PASSWORD=your_secure_password
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_ADMIN_ENDPOINT=http://localhost:3002
```

Start the stack with:

```bash
docker compose up -d logto logto-postgres
```

Then open the admin console:

- `http://localhost:3002`

The first created user becomes an administrator.

## 3. Create The SPA Application

In Logto Admin Console:

1. Go to `Applications`.
2. Create a new application.
3. Choose `Single page app`.

Use the SPA app for `dashboard-ts-router`.

Recommended local settings:

- Redirect URI: `http://localhost:3001/callback`
- Post sign-out redirect URI: `http://localhost:3001/sign-in`
- Allowed origin: `http://localhost:3001`

If you deploy the SPA behind Caddy or another hostname, add the production equivalents too.

Example:

- Redirect URI: `https://your-dashboard-host/callback`
- Post sign-out redirect URI: `https://your-dashboard-host/sign-in`
- Allowed origin: `https://your-dashboard-host`

For the SPA path, the dashboard uses these frontend environment variables:

```env
VITE_LOGTO_ENDPOINT=http://localhost:3011
VITE_LOGTO_APP_ID=your_spa_app_id
VITE_LOGTO_API_RESOURCE=https://asm2-api.company.internal
```

Or, if you prefer the shared root env naming used by this repo:

```env
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_APP_ID=your_spa_app_id
LOGTO_API_RESOURCE=https://asm2-api.company.internal
```

Notes:

- `dashboard-ts-router/src/lib/logto.ts` reads the normalized `VITE_*` values.
- `dashboard-ts-router/src/lib/api.ts` uses `/api` in production and `http://localhost:8000` in local dev when no explicit frontend backend URL is provided.
- Unlike the old Next.js dashboard flow, the SPA does not need `LOGTO_APP_SECRET` or `LOGTO_COOKIE_SECRET` in browser code.
- No Logto organization template is required for this setup.

## 4. Create The Backend API Resource

In Logto Admin Console:

1. Go to `API resources`.
2. Create a resource for the FastAPI backend.
3. Choose a stable resource identifier.

Example identifiers:

- `https://asm2-api.company.internal`
- `https://api.asm2.local`
- `urn:asm2:backend`

Important:

- this value is the API audience identifier
- it must match exactly in Logto, the SPA token request, and backend validation
- it is not the same thing as `/api` or a specific metrics route

Create these permissions on the API resource:

- `metrics:read`
- `metrics:export`

The SPA currently requests both of these scopes in `dashboard-ts-router/src/lib/logto.ts`.

Recommended role model:

- `user` role should include `metrics:read`.
- `admin` role should include `metrics:read` and `metrics:export`.

Backend environment values:

```env
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_API_RESOURCE=https://asm2-api.company.internal
CORS_ALLOW_ORIGINS=http://localhost:3001
```

FastAPI validation behavior:

- fetches OpenID configuration from `${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration`
- retrieves signing keys from Logto JWKS
- validates `iss`, `aud`, `sub`, and token expiry
- enforces route scopes through FastAPI dependencies

Protected backend routes currently include:

- `GET /metrics/dashboard` requires `metrics:read`
- `GET /metrics/stats` requires `metrics:read`
- `GET /metrics/export` requires `metrics:export`

## 5. Optional Default Global User Role Bootstrap

If you want newly signed-in users to automatically receive a default global user role, create a machine-to-machine application in Logto.

In Logto Admin Console:

1. Go to `Applications`.
2. Create a `Machine-to-machine` application.
3. Grant it access to the Logto Management API.

For the backend bootstrap flow, configure:

```env
LOGTO_MANAGEMENT_APP_ID=your_m2m_app_id
LOGTO_MANAGEMENT_APP_SECRET=your_m2m_app_secret
LOGTO_MANAGEMENT_API_RESOURCE=https://default.logto.app/api
LOGTO_DEFAULT_USER_ROLE_ID=your_default_role_id
```

Important:

- `LOGTO_MANAGEMENT_API_RESOURCE` is not your backend API resource
- use the default management API resource for Logto management access: `https://default.logto.app/api`
- keep `LOGTO_API_RESOURCE` for your own FastAPI audience

Bootstrap flow in this repo:

1. User signs in through the SPA.
2. Logto redirects to `dashboard-ts-router/src/routes/callback.tsx`.
3. The SPA requests an API token for `LOGTO_API_RESOURCE`.
4. The SPA calls `POST /auth/bootstrap` on the backend.
5. The backend assigns the configured default global user role if missing.
6. If Logto role assignment changed permissions, the SPA refreshes the API token.
7. The SPA navigates to the requested page.

If the management env vars are not configured, bootstrap is skipped and the app continues normally.

## 6. Local Development Configuration

### SPA running locally against local backend

```env
VITE_LOGTO_ENDPOINT=http://localhost:3011
VITE_LOGTO_APP_ID=your_spa_app_id
VITE_LOGTO_API_RESOURCE=https://asm2-api.company.internal
VITE_BACKEND_URL=http://localhost:8000
```

Backend:

```env
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_API_RESOURCE=https://asm2-api.company.internal
CORS_ALLOW_ORIGINS=http://localhost:3001
```

### SPA served behind Caddy in Docker

In the SPA deployment override, the frontend uses `/api` and Caddy proxies it to the internal backend service.

Relevant file:

- `docker-compose.dashboard-spa.yml`

In that mode:

- browser connects to the SPA on port `3001`
- SPA calls `/api/...`
- Caddy forwards `/api/*` to `backend:8000`

## 7. Environment Formatting Caveat

Be careful with quoted env values.

For backend runtime values such as URLs and integers, use plain values unless your loader explicitly strips quotes.

Good:

```env
LOGTO_ENDPOINT=https://logto.example.com
QUESTDB_PORT=8812
```

Problematic in this repo's backend runtime if the literal quotes are preserved:

```env
LOGTO_ENDPOINT="https://logto.example.com"
QUESTDB_PORT="8812"
```

Quoted values previously caused:

- OpenID discovery URL failures for `LOGTO_ENDPOINT`
- integer parsing failures for `QUESTDB_PORT`

If authentication suddenly fails with malformed discovery URLs, check the effective backend value of `LOGTO_ENDPOINT` first.

## 8. Testing The Full Flow

1. Start Logto and its PostgreSQL database.
2. Start the backend.
3. Start `dashboard-ts-router` or the SPA deployment stack.
4. Open `http://localhost:3001`.
5. Click `Sign In`.
6. Complete authentication in Logto.
7. Confirm the app returns to `/callback` and then back to `/`.
8. Confirm the backend accepts the bearer token and metrics load.

If default-role bootstrap is enabled:

1. Sign in with a user that does not yet have the target role.
2. Confirm `POST /auth/bootstrap` succeeds.
3. Confirm the user receives the configured default role in Logto.
4. Confirm a refreshed token includes the expected API scopes.

## 9. Enterprise SSO

To add enterprise identity providers:

1. Open the Logto Admin Console.
2. Go to `Enterprise SSO`.
3. Add the desired connector.
4. Follow the provider-specific setup for Google Workspace, Microsoft Entra ID, Okta, OIDC, or SAML.

Once enabled, those sign-in methods appear automatically in the hosted Logto experience.

## 10. Technical Reference

| Item | Value / Path |
| :--- | :--- |
| Admin Console | `http://localhost:3002` |
| Self-hosted Logto endpoint | `http://localhost:3011` |
| SPA sign-in route | `dashboard-ts-router/src/routes/sign-in.tsx` |
| SPA callback route | `dashboard-ts-router/src/routes/callback.tsx` |
| SPA Logto config | `dashboard-ts-router/src/lib/logto.ts` |
| SPA backend URL config | `dashboard-ts-router/src/lib/api.ts` |
| Backend JWT validation | `backend/src/config/logto_auth.py` |
| Backend bootstrap endpoint | `backend/server.py` |
| Backend management API client | `backend/src/config/logto_management.py` |

Created for the ASM2 Development Team.
