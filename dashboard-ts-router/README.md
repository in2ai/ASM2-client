# Dashboard TS Router

TanStack Router migration of the original Next.js dashboard.

## Setup

Create `.env` at repository root (or `dashboard-ts-router/.env.local`) with:

```env
VITE_BACKEND_URL=/api
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_APP_ID=your_logto_app_id
LOGTO_API_RESOURCE=http://10.0.0.15:8001
```

The Vite config maps these shared `LOGTO_*` values to the `VITE_*` names consumed by browser code, so you only need to define one set of Logto variables in project env files.

Make sure backend env also defines:

```env
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_API_RESOURCE=http://10.0.0.15:8001
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:5173
LOGTO_MANAGEMENT_APP_ID=your_m2m_app_id
LOGTO_MANAGEMENT_APP_SECRET=your_m2m_app_secret
LOGTO_MANAGEMENT_API_RESOURCE=https://default.logto.app/api
```

`LOGTO_API_RESOURCE` is the API audience identifier used in access tokens. It should match the backend API identity (for example the internal URL employees use on VPN/Wi-Fi), not a specific route like `/metrics/dashboard`.

The SPA requests the Logto `roles` scope and derives admin UI access from Logto role claims. The backend resolves roles server-side through the Logto Management API when the management credentials above are configured. Default global roles should be assigned directly in Logto.

This dashboard uses Logto global roles only, and no Logto organization template is required.

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
- reverse proxy `/api/*` to `http://backend:8001/*`

Example build commands:

```bash
docker build -f dashboard-ts-router/Dockerfile.caddy -t asm2-dashboard:caddy dashboard-ts-router
```

Compose integration (from repo root):

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

The base compose stack now includes the TanStack SPA image (served by Caddy), the FastAPI backend, and Qdrant. The local override adds QuestDB and Logto.

In the Docker stack, host traffic goes through Caddy on port `3001`, which serves the SPA and proxies `/api/*` to `backend:8001` over the internal Docker network.

The backend, Qdrant, and QuestDB services are not published on host ports.

Both services now include health checks:

- `backend` must answer `GET /healthz`
- `dashboard` must answer `GET /`

The dashboard waits for the backend health check before starting.
