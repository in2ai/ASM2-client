# Dokploy Home Server Deployment

This repository now includes a production-oriented Dokploy compose file at `docker-compose.dokploy.yml`.

Use it when you want to deploy the full stack on a single Dokploy host:

- `dashboard` public on your main app domain
- `logto` public on a dedicated auth domain
- `logto` admin console public on a dedicated admin domain
- `backend`, `qdrant`, `timescaledb`, and `timescaledb-init` internal only
- NVIDIA GPU enabled for `backend` and `qdrant`

## Important: Use a Docker Compose App

If the Dokploy screen shows build types such as `Nixpacks`, `Dockerfile`, or `Static`, you are in the wrong app type for this repository.

For this project, create a **Docker Compose** application or stack in Dokploy and use `docker-compose.dokploy.yml` from the repository root.

## 1. Server Prerequisites

Before deploying, verify all of these on the home server:

1. Dokploy is already installed and reachable.
2. Docker can use the NVIDIA GPU.
3. The NVIDIA Container Toolkit is installed on the host.
4. Ports `80` and `443` on the router are forwarded to the Dokploy host.
5. The DNS records for your public domains point to the home server public IP.

If the ISP uses CGNAT, direct public ingress will not work. In that case, put Cloudflare Tunnel or a VPS reverse proxy in front of the home server.

## 2. Recommended Domains

Use these subdomains:

- app domain: `app.example.com`
- Logto public domain: `auth.example.com`
- Logto admin domain: `admin-auth.example.com`

The admin domain is public in this setup because Logto needs an admin console during configuration. Protect it with a strong password, MFA, and preferably an additional access restriction once setup is complete.

## 3. Dokploy Application Setup

Create a new Dokploy **Docker Compose** application and configure:

1. Provider: GitHub
2. Repository: this repository
3. Branch: the branch you want to deploy
4. Build path: `/`
5. Compose file: `docker-compose.dokploy.yml`

If Dokploy asks you to paste the compose content instead of selecting a path, paste the contents of `docker-compose.dokploy.yml`.

## 4. Environment Variables

The compose file uses `env_file: .env` for shared runtime configuration. That matters because Dokploy Compose variables are typically written to a `.env` file, but they are not injected into containers automatically unless the compose file explicitly loads them. This repository now follows that pattern.

Notes:

- `LOGTO_APP_ID` is not known until after Logto is running and you create the SPA application in Logto.
- For the first deployment, set `LOGTO_APP_ID=bootstrap-placeholder`.
- After Logto is up, create the SPA application, replace that value with the real app id, and redeploy.
- Set strong TimescaleDB credentials (`PG_USER` / `PG_PASSWORD`).
- If you use the Google Drive connector, prefer setting `CLIENT_SECRET` as inline JSON in Dokploy instead of mounting a secret file.
- Only a small set of environment entries remain inline in the compose file. Those are service-local overrides such as internal hostnames, container paths, GPU flags, build-time mappings, translated variable names, or computed values.
- The dashboard build reads the shared `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, and `LOGTO_API_RESOURCE` values, and Vite exposes them as `VITE_*` values for browser code.
- `LOGTO_POSTGRES_PASSWORD` is defined in Dokploy's `Environment` tab. The compose file turns it into the runtime Docker secret `logto_postgres_password` for the database initialization job and Logto.
- Logto has a dedicated `logto` database and role inside the shared PostgreSQL 18 / TimescaleDB instance. It does not use the application's `tsdb` database.
- The `logto` role has `CREATEROLE`, but is not a superuser, because Logto creates an internal tenant role during schema seeding.

## 5. Domains in Dokploy

In Dokploy, add these domain mappings:

1. Service `dashboard`, port `80` -> `app.example.com`
2. Service `logto`, port `3001` -> `auth.example.com`
3. Service `logto`, port `3002` -> `admin-auth.example.com`

Do not expose `backend`, `qdrant`, or `timescaledb` publicly.

## 6. First Deployment Order

If this Dokploy installation already has Logto users or configuration, create the
dump described in **Migrating an existing Logto database** below before step 2.

Use this order:

1. Set `LOGTO_APP_ID=bootstrap-placeholder`.
2. Deploy the Dokploy compose application.
3. Wait until `timescaledb` is healthy, `timescaledb-init` completes successfully, and `logto` starts.
4. If you created an existing Logto dump, complete the restore procedure below.
5. Open the Logto admin console at `https://admin-auth.example.com`.
6. Create your first admin user only when this is a new Logto installation.
7. Create or verify the Logto SPA application for the dashboard.
8. Create or verify the Logto API resource for the FastAPI backend.
9. Replace `LOGTO_APP_ID` in Dokploy with the real Logto SPA app id.
10. Redeploy the Dokploy application.

### Migrating an existing Logto database

The previous stack used a separate PostgreSQL 18 container. Migrate it with a
logical dump; do not copy its data directory into the TimescaleDB volume.

Before deploying the new compose file, find the old database container and
create a private dump on the server:

```bash
docker ps \
  --filter label=com.docker.compose.service=logto-postgres \
  --format '{{.Names}}'

umask 077
docker exec <old-logto-postgres-container> \
  pg_dump -U logto -d logto -Fc --no-owner --no-privileges \
  > logto-pg18.dump

docker run --rm -v "$PWD:/backup:ro" postgres:18-alpine \
  pg_restore --list /backup/logto-pg18.dump > /dev/null
```

Deploy the new compose file. Because TimescaleDB has not previously been
deployed on this server, its `timescaledb-data` volume is initialized directly
as PostgreSQL 18. The old `logto-postgres-data` volume is not deleted by a
normal Dokploy redeploy.

After deployment, find the new containers:

```bash
docker ps \
  --filter label=com.docker.compose.service=timescaledb \
  --format '{{.Names}}'
docker ps \
  --filter label=com.docker.compose.service=logto \
  --format '{{.Names}}'
```

Stop Logto, replace the newly seeded empty `logto` database, and restore the
dump. Replace the two container placeholders with the names returned above:

```bash
docker stop <logto-container>

docker exec -i <timescaledb-container> \
  sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres' <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'logto' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS logto;
CREATE DATABASE logto OWNER logto TEMPLATE template0;
SQL

docker exec -i <timescaledb-container> \
  sh -c 'pg_restore --exit-on-error --no-owner --no-privileges --role=logto -U "$POSTGRES_USER" -d logto' \
  < logto-pg18.dump

docker start <logto-container>
docker logs --tail 100 <logto-container>
```

Verify existing users, applications, roles, and a complete sign-in flow before
removing the dump or the old `logto-postgres-data` volume. Never use
`docker compose down -v` during this migration.

## 7. Logto Configuration

Once Logto is running, configure it like this.

### SPA Application

Create a `Single page app` in Logto.

Use these values:

- Redirect URI: `https://app.example.com/callback`
- Post sign-out redirect URI: `https://app.example.com/sign-in`
- Allowed origin: `https://app.example.com`

### API Resource

Create one API resource for the backend.

Use one stable audience string, for example:

- `urn:asm2:backend`

Then set `LOGTO_API_RESOURCE` in Dokploy to exactly that same value.

If you want backend-side role resolution, also create a machine-to-machine application in Logto and set:

- `LOGTO_MANAGEMENT_APP_ID`
- `LOGTO_MANAGEMENT_APP_SECRET`
- `LOGTO_MANAGEMENT_API_RESOURCE`

## 8. Google Drive Connector

If you use the Google Drive connector:

1. Put the Google OAuth client JSON in Dokploy as `CLIENT_SECRET`.
2. The value must be the raw JSON object on one line.
3. Add this redirect URI in Google Cloud:
   - `https://app.example.com/chat/provider-callback`

The backend already supports `CLIENT_SECRET` from env, so a mounted file is optional.

## 9. GPU Notes

The Dokploy compose file already enables NVIDIA GPU access for:

- `backend`
- `qdrant`

If containers start but GPU is unavailable inside them, the problem is on the host Docker runtime, not in this repository. Validate the host with an NVIDIA-enabled test container before debugging the application stack.

## 10. Persistence and Backups

This deployment persists data in named Docker volumes:

- `backend-data`
- `qdrant-data`
- `timescaledb-data`
- `logto-connectors`

Use Dokploy volume backup features for at least:

- `qdrant-data`
- `timescaledb-data`
- `backend-data`

## 11. What Is Public vs Internal

Public:

- `dashboard`
- `logto` main endpoint
- `logto` admin console

Internal only:

- `backend`
- `qdrant`
- `timescaledb`
- `timescaledb-init`

TimescaleDB remains internal, used by the `backend` and init SQL over the PostgreSQL protocol. It is not exposed publicly.

The dashboard proxies `/api/*` to `backend:8001`, so the backend should not get its own public domain.

## 12. Post-Deploy Checks

After the final redeploy, verify:

1. `https://app.example.com` loads.
2. Sign-in redirects to `https://auth.example.com`.
3. After login, the browser returns to `https://app.example.com/callback`.
4. The dashboard can call `/api` successfully.
5. Logto discovery works from the backend.
6. Metrics pages load without auth errors.

## 13. Operational Warnings

- Do not use the standard Dokploy build-type app for this repository.
- Do not expose `backend` directly to the internet.
- Do not expose TimescaleDB publicly; it is internal-only.
- Do not leave `LOGTO_APP_ID=bootstrap-placeholder` after Logto setup.
