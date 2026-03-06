# Dashboard TS Router

TanStack Router migration of the original Next.js dashboard.

## Setup

Create `.env` at repository root (or `dashboard-ts-router/.env.local`) with:

```env
VITE_BACKEND_URL=/api
VITE_LOGTO_ENDPOINT=http://localhost:3011
VITE_LOGTO_APP_ID=your_logto_app_id
VITE_LOGTO_API_RESOURCE=http://10.0.0.15:8000
```

You can also use existing root keys without the `VITE_` prefix:

```env
BACKEND_URL=/api
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_APP_ID=your_logto_app_id
LOGTO_API_RESOURCE=http://10.0.0.15:8000
```

Make sure backend env also defines:

```env
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_API_RESOURCE=http://10.0.0.15:8000
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
```

`LOGTO_API_RESOURCE` is the API audience identifier used in access tokens. It should match the backend API identity (for example the internal URL employees use on VPN/Wi-Fi), not a specific route like `/metrics/dashboard`.

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## SPA deployment (Caddy)

This app is built as static files (`dist`) and served as an SPA with history fallback (`/index.html`).

- `Dockerfile.caddy` + `Caddyfile`

Both configs:

- serve static assets
- rewrite unknown routes to `index.html` for TanStack Router
- reverse proxy `/api/*` to `http://backend:8000/*`

Example build commands:

```bash
docker build -f dashboard-ts-router/Dockerfile.caddy -t asm2-dashboard:caddy dashboard-ts-router
```

Compose integration (from repo root):

```bash
docker compose -f docker-compose.yml -f docker-compose.dashboard-spa.yml up --build
```

This override file replaces the legacy `dashboard` service with the TanStack SPA image (served by Caddy) and adds the `backend` API service.
