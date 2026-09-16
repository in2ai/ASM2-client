# Dashboard TS Router

TanStack Router SPA for ASM2: metrics dashboard, RAG chat, source management, and
indexing alerts/progress.

## Setup

`vite.config.ts` sets `envDir: '..'` and reads env files with `loadEnv(mode, '..', '')`,
so **environment files are read from the repository root**, not from `frontend/`.
Put the values in the root `.env` (or `.env.local`), or export them in the shell —
`process.env` is merged on top of the loaded files.

```env
LOGTO_ENDPOINT=http://localhost:3011
LOGTO_APP_ID=your_logto_app_id
LOGTO_API_RESOURCE=http://10.0.0.15:8001
BACKEND_URL=http://localhost:8001
```

These names carry **no** `VITE_` prefix. `vite.config.ts` reads them and injects them
into the bundle through `define` as `import.meta.env.VITE_LOGTO_ENDPOINT`,
`VITE_LOGTO_APP_ID`, `VITE_LOGTO_API_RESOURCE` and `VITE_BACKEND_URL`, which is what
`src/lib/logto.ts` and `src/lib/api.ts` consume. Setting `VITE_*` names directly in an
env file has no effect.

`BACKEND_URL` is optional: when it is empty, `src/lib/api.ts` falls back to `/api` in
production builds and `http://localhost:8001` in dev.

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

The dev server listens on port `3001` (`vp dev --port 3001`).

## Tooling

The project uses [Vite+](https://viteplus.dev/) (`vp`) for dev, build, lint, format and
unit tests. Playwright covers end-to-end tests.

```bash
pnpm check      # format, lint and type check
pnpm lint       # oxlint only
pnpm format     # oxfmt
pnpm test       # Vitest unit tests (src/**/*.test.{ts,tsx})
pnpm test:e2e   # Playwright end-to-end tests (e2e/)
pnpm build      # production build into dist/
```

Translations live in `src/i18n/messages/{es,en,gl}.json` and are compiled by
`@inlang/paraglide-js` into `src/paraglide` at build time. `pnpm machine-translate`
fills in missing keys through the inlang CLI.

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
docker build -f frontend/Dockerfile.caddy -t asm2-dashboard:caddy frontend
```

Compose integration (from repo root):

```bash
docker compose -f docker-compose.yml -f docker-compose.timescaledb.yml -f docker-compose.local.yml up --build
```

The base compose stack includes the TanStack SPA image (served by Caddy), the FastAPI backend, and Qdrant. The TimescaleDB override adds the database, and the local override adds Logto.

In the Docker stack, host traffic goes through Caddy on port `3001`, which serves the SPA and proxies `/api/*` to `backend:8001` over the internal Docker network.

Published host ports in that stack:

- `dashboard` on `3001` (all interfaces)
- `backend` on `127.0.0.1:8001`, for local debugging only
- `timescaledb` on `127.0.0.1:5432`, for inspecting the database
- `qdrant` is not published; it is reachable only from the Docker network

Both services include health checks:

- `backend` must answer `GET /healthz`
- `dashboard` must answer `GET /`

The dashboard waits for the backend container to start before starting.
