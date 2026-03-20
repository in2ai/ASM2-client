## Google Drive source management changes summary

This file summarizes the changes made during the Google Drive source-management migration/debugging work.

### Goal

- move source connection flow to a frontend-started Google OAuth flow
- support Google Drive only for now
- let the backend exchange/store credentials
- expose source status, connect, disconnect, selection, and reindex behavior in the SPA

### Backend changes

#### OAuth / source-management flow

- `backend/server.py`
  - added/updated Google Drive connect completion flow using auth-code exchange on the backend
  - validated callback `redirect_uri` origin against allowed frontend origins
  - exposed Google OAuth client id in `/sources/status`
  - limited active provider handling to Google Drive
  - added stronger logging around Google login / validation failures

- `backend/src/config/sources.py`
  - reduced active source-provider registry to Google Drive only

- `backend/src/config/config.py`
  - made Google client secret path configurable via:
    - `GOOGLE_CLIENT_SECRET_FILE`
    - fallback `CLIENT_SECRET_FILE`
    - fallback default `secrets/client_secret.json`
  - aligned OAuth scopes with the scopes Google was actually returning:
    - `drive.readonly`
    - `openid`
    - `userinfo.email`
    - `userinfo.profile`

- `backend/src/config/auth.py`
  - added safer handling for missing `source_preferences` during reads
  - removed auto-create behavior for `source_preferences` after request to provision it manually
  - normalized stored timestamps for QuestDB-safe inserts
  - changed disconnect behavior to write an empty latest credential record so disconnect overrides old valid credentials

- `backend/src/connectors/source.py`
  - added `last_error` support on sources for clearer auth/debug reporting

- `backend/src/connectors/drive.py`
  - improved Google Drive login error logging
  - kept credential parsing/refresh behavior compatible with stored authorized-user JSON

#### Container / dependency changes

- `backend/pyproject.toml`
  - added `fasttext-numpy2-wheel`

- `backend/uv.lock`
  - updated lockfile for backend dependency changes

- `backend/Dockerfile`
  - updated image build so backend dependencies are synced during `docker build`
  - created `/app/secrets` in the image as a sensible mount target for `client_secret.json`

### Frontend changes

#### Source panel / Google Drive connect flow

- `dashboard-ts-router/src/features/chat/sources-panel.tsx`
  - simplified source UI to Google Drive only
  - disabled reindex when Drive is not connected
  - cleared stale inline errors before starting auth
  - switched panel to use frontend-built Google OAuth URL

- `dashboard-ts-router/src/features/chat/google-drive-auth.ts`
  - added helpers to:
    - build the Google OAuth URL
    - create/store/read/clear pending OAuth request state in `sessionStorage`
    - normalize callback return targets
    - detect the callback path

- `dashboard-ts-router/src/features/chat/google-drive-auth.test.ts`
  - added tests for OAuth URL building and session-storage helpers

#### Callback route

- `dashboard-ts-router/src/routes/chat.provider-callback.tsx`
  - added Google OAuth callback route handling
  - validated `state`
  - exchanged the returned Google auth code with the backend
  - attempted multiple fixes to make redirect back to `/chat` reliable after success
  - latest version uses a direct authorized POST plus hard redirect to `/chat`

- `dashboard-ts-router/src/routes/chat.tsx`
  - updated parent route to render the child callback route instead of swallowing `/chat/provider-callback`

#### API / types / copy

- `dashboard-ts-router/src/features/chat/api.ts`
  - updated source connect/disconnect/status helpers used by the sources panel/callback flow

- `dashboard-ts-router/src/features/chat/types.ts`
  - aligned source-related frontend types with the backend status/operation payloads

- `dashboard-ts-router/src/i18n/messages/en.json`
- `dashboard-ts-router/src/i18n/messages/es.json`
- `dashboard-ts-router/src/i18n/messages/gl.json`
  - updated source-panel copy for Google-Drive-only behavior and callback error states

### Database expectations

- `sql/init.sql`
  - `source_preferences` should exist and be provisioned manually
  - disconnect/connect logic relies on the `credentials` table as the source of truth for stored provider credentials

### Validation run during this work

- frontend
  - `pnpm vitest run src/features/chat/google-drive-auth.test.ts`
  - `pnpm build`

- backend
  - `python3 -m py_compile ...`
  - `python3 -m unittest tests.test_source_auth`
  - `docker build -f backend/Dockerfile -t asm2-backend:local backend`

### Current known issues at stop point

- Google OAuth exchange can succeed on the backend, but the SPA callback page may still remain on:
  - `/chat/provider-callback?...`
- manually navigating back to `/chat` can show the source as connected, which suggests the backend storage path works and the remaining issue is in frontend callback completion/navigation
- backend still logs `403 insufficientPermissions` warnings from an additional Google API lookup path; this was not resolved in this work
- retrying a callback URL after one successful exchange can produce `invalid_grant` because Google auth codes are single-use

### Main files touched in this work

- `backend/Dockerfile`
- `backend/pyproject.toml`
- `backend/server.py`
- `backend/src/config/auth.py`
- `backend/src/config/config.py`
- `backend/src/config/sources.py`
- `backend/src/connectors/drive.py`
- `backend/src/connectors/source.py`
- `backend/tests/test_source_auth.py`
- `backend/uv.lock`
- `dashboard-ts-router/src/features/chat/api.ts`
- `dashboard-ts-router/src/features/chat/google-drive-auth.test.ts`
- `dashboard-ts-router/src/features/chat/google-drive-auth.ts`
- `dashboard-ts-router/src/features/chat/sources-panel.tsx`
- `dashboard-ts-router/src/features/chat/types.ts`
- `dashboard-ts-router/src/i18n/messages/en.json`
- `dashboard-ts-router/src/i18n/messages/es.json`
- `dashboard-ts-router/src/i18n/messages/gl.json`
- `dashboard-ts-router/src/routes/chat.provider-callback.tsx`
- `dashboard-ts-router/src/routes/chat.tsx`
- `sql/init.sql`