# Google Drive migration report

This document is the consolidated migration report for the Google Drive provider and chat UI migration from the legacy Streamlit app into the current FastAPI backend and React SPA.

It replaces the earlier split between `GOOGLE_DRIVE_CHANGES_SUMMARY.md` and the previous `GOOGLE_DRIVE_MIGRATION_STATUS.md`.

> **Status of this document.** This is a *historical* migration report: it records how the
> Google Drive path moved out of Streamlit and why each decision was taken. The migration
> has since been completed and the codebase has moved on — Dropbox shipped as a second
> provider, the source-management API was reshaped, and QuestDB was replaced by
> TimescaleDB. Sections below have been corrected where they described the current code,
> and each superseded design is called out inline. For the behaviour of the system as it
> stands today, read the code plus [DROPBOX_CONNECTOR.md](DROPBOX_CONNECTOR.md),
> [SISTEMA_ALERTAS_INDEXADO.md](SISTEMA_ALERTAS_INDEXADO.md) and the root
> [README.md](README.md).

## 1. Goal and scope

The migration goal is to preserve the Google Drive-backed chat experience from the legacy Streamlit app while moving the application to:

- a FastAPI backend in `backend/`
- a React SPA in `frontend/`

The current scope is intentionally narrow:

- Google Drive is the only provider that must work
- the chat flow that depends on Google Drive must work
- `mecopia/` and `mecopia-web-backend/` are used only as UI/UX references
- attachments, streaming, Dropbox, OneDrive, and the rest of Mecopia's runtime architecture were explicitly out of scope *for this migration pass*

Dropbox has since been implemented as a second provider on the same `DataSource` contract;
see [DROPBOX_CONNECTOR.md](DROPBOX_CONNECTOR.md). OneDrive constants still exist in
`backend/src/config/config.py` but there is no OneDrive connector.

## 2. Legacy Streamlit behavior that the migration is preserving

The migration was audited against the legacy implementation in:

- `app.py`
- `src/connectors/drive.py`
- `src/connectors/search.py`
- `src/connectors/vdb_file.py`

The important legacy behaviors were:

- Google Drive authorization was stored as Google authorized-user credentials
- indexing was rooted at a configured Google Drive folder
- retrieval was ACL-aware, not just vector similarity based
- the effective access model was a shared indexed corpus with per-user permission checks at query time
- chat answers surfaced source information

That legacy behavior matters because it drives the main architecture choice in the migration.

## 3. Main architecture decisions locked for the migration

The Google Drive migration is now aligned to this model:

- one shared, admin-managed indexed corpus
- per-user Google Drive authorization for ACL-aware retrieval and source selection
- one FastAPI backend as the system of record for source state, credentials, reindex status, and chats
- one SPA in `frontend/` as the production frontend

This means the migration does **not** use a fully per-user indexed vector corpus. Instead:

- admins are responsible for building the shared Google Drive index
- users still connect their own Google Drive account
- retrieval checks what each user can actually access before returning results

This matches the old Streamlit behavior more closely and avoids dangerous mixed ownership over the shared Qdrant collection.

## 4. Current migration state in one paragraph

At this point, the Google Drive migration is largely implemented in code:

- backend source management exists
- backend Google OAuth code exchange exists
- credentials are stored in SQL tables (QuestDB at the time of the migration, TimescaleDB/PostgreSQL today)
- source selection exists
- shared admin-only reindex exists
- chat persistence exists
- assistant messages now persist and expose citation metadata
- the React chat UI can connect Drive, select it, trigger reindex, and render citations

What still remains is live end-to-end validation with real Google credentials, real callback execution, admin reindex, non-admin restrictions, and multi-user ACL checks.

## 5. What was already present before the latest Google Drive hardening work

Before the latest migration pass, the repository already had meaningful migration foundations in place:

- `backend/server.py` already exposed backend chat and source routes
- `backend/src/chat/store.py` already provided persisted chat storage
- `backend/graph/*` already contained LangGraph-based chat orchestration
- `backend/src/utils/rag.py` already handled retrieval/reranking primitives
- `frontend/src/routes/chat.tsx` and `frontend/src/features/chat/*` already contained a real chat route and UI shell

The migration work described below focused on correcting the Google Drive semantics, finishing the chat/source contract, and closing the most important feature-parity gaps with the Streamlit version.

## 6. Detailed backend changes

This section is intentionally detailed because most of the migration risk lived in the backend and the persistence layer.

### 6.1 `backend/server.py`

This is the main orchestration file for the migration. It now owns the full Google Drive source-management contract, reindex orchestration, and the chat response shape used by the SPA.

#### Source status and provider contract

> **Superseded.** The per-provider `SourceProviderStatusModel` and `ReindexStatusModel`
> were dropped when the source API was reshaped for Dropbox.

The source contract the backend exposes today is two flat models in
`backend/src/model/endpoints.py`:

- `SourcesStatusModel` — `connected_sources`, `selected_sources`, `vdb_indexing_active`
  and `can_chat`, built by `build_sources_status()`. `can_chat` is true only when the user
  has at least one selected *and* connected source and the manifest reports the initial
  build as complete.
- `SourceLoginInfoModel` — `auth_mode` and `oauth_client_id`, served by
  `GET /sources/login-info?source=`, so the SPA starts OAuth without hardcoding provider
  client settings.

The `account_label`, `last_error` and reindex-availability fields described in the migration
plan are not part of the HTTP contract. `account_label()` survives inside the Dropbox
connector, where it is used for logging only.

#### Backend-managed Google OAuth exchange

The backend owns the actual authorization-code exchange. The decision held; only the shape
changed when the exchange was generalized for a second provider.

> **Superseded.** The migration-era helpers `_get_drive_client_config()`,
> `_get_drive_oauth_client_id()`, `_build_drive_flow()` and `_validate_redirect_uri()` were
> renamed and moved out of `server.py`. The per-provider route
> `POST /sources/{provider}/connect` was replaced by one generic `POST /login-source`, and
> the backend no longer validates the redirect URI origin itself.

The current flow is:

1. The SPA reads `GET /sources/login-info?source=drive`, which returns `auth_mode` and
   `oauth_client_id` from `GoogleDriveSource.login_info()`, and builds the Google
   authorization URL from them.
2. Google redirects back to `/chat/provider-callback` in the SPA.
3. The SPA posts `{ source, payload: { auth_token, redirect_uri } }` to `POST /login-source`.
4. `validate_source()` resolves the provider from `SOURCES`; unknown names return 404.
5. The connector is instantiated with that payload and `login()` is called. For Drive,
   `login()` detects the first-login shape (`auth_token` + `redirect_uri`), exchanges the code
   through `google_auth_oauthlib.flow.Flow`, and replaces `raw_creds` with the serialized
   authorized-user JSON from `serialize_drive_credentials()`.
6. `login()` then builds the Drive client and computes the authenticated principals, so a
   credential that does not actually work never reaches the database.
7. `expiry()` returns `needs_refresh_at` (20 minutes before expiry) and `expires_at`, and
   `add_credentials()` appends the row, flagged `is_admin` when the caller holds the ASM2
   `admin` role.

The redirect URI is still supplied by the SPA rather than taken from a static config value, so
the backend is not coupled to a single hardcoded callback URL. Auto-selecting the provider
after connecting is no longer done by the backend; the SPA drives selection through
`PUT /sources/selection`.

#### Source connection, selection, and disconnection

> **Superseded.** The per-provider `connect`/`disconnect` routes described here were
> replaced by a single OAuth exchange endpoint when Dropbox was added. There is no
> disconnect route in the current backend.

The source-management surface in the current backend is:

- `GET /sources/login-info?source=` — provider-specific data the SPA needs to start OAuth
- `POST /login-source` — exchanges the authorization code and stores the credentials
- `GET /sources/status` and `GET /authenticated-sources` — connection and selection state
- `PUT /sources/selection` — sets the providers used for chat

The important behaviors are:

- only known providers are accepted through `validate_source()`, which looks the name up in
  `SOURCES` (`backend/src/config/sources.py`) and returns 404 otherwise
- selecting a provider that is not connected returns 409
- credentials are stored per user in the append-only `credentials` table, flagged `is_admin`
  when the connecting user holds the ASM2 `admin` role

The append-only model is preserved: `add_credentials()` always inserts, and reads take the
newest row per `(user_id, source)`, so old rows stay for audit and never have to be mutated.

#### Shared admin-managed reindex semantics

One of the biggest migration fixes was the reindex model.

> **Superseded.** The `POST /sources/reindex` route and the in-memory
> `app.state.source_reindex_jobs` state were replaced by the indexing-control endpoints
> and a persisted progress row.

The decision that survived is the important one: indexing is a **single shared job that runs
on admin credentials**, never a per-user rebuild of a shared collection. The current
implementation is:

- `POST /start-vdb-update`, `POST /stop-vdb-update` and `GET /vdb-update-status`, all
  admin-only, toggle the `vdb.lock` file that enables indexing and schedule a run
- `run_vdb_update_once()` in `backend/server.py` calls `get_authenticated_admin_sources()`,
  so the corpus is built from the sources connected by ASM2 admins across every provider
- the run reports itself through `PostgresIndexingProgress`, which overwrites the singleton
  `indexing_progress` row, so progress is **durable across restarts**; a run left as
  `running` by a process that died is marked `interrupted` on the next startup
- `GET /indexing/progress` exposes that row to managers and admins, and
  `frontend/src/features/indexing-progress/` renders it
- a periodic task re-runs the job roughly once an hour while `vdb.lock` exists

The deletion guard runs inside the same job and can block it before Qdrant is touched; see
[SISTEMA_ALERTAS_INDEXADO.md](SISTEMA_ALERTAS_INDEXADO.md).

#### Chat execution and citation persistence

The backend chat path now persists richer assistant message metadata.

The central function is `_run_chat_turn()`:

- it loads the user's currently selected authenticated sources
- it returns 409 when the user has no selected source, and a second 409 when `can_chat` is
  false because the initial indexing has not finished
- it invokes the graph with the thread id, the chat LLM, the tool-bound LLM, the chunk
  relevance judge LLM, the vector store, the reranker, the PostgreSQL/TimescaleDB pool, the
  authenticated source objects and the metrics actor
- it attaches the Langfuse callback handler when tracing is configured, and wraps the
  invocation in a `TimedMetric` that records the LLM response time
- after the graph returns it records token-usage metrics and reads the turn's artifacts

The result returned by `_run_chat_turn()` includes:

- `answer`
- `detected_lang`
- `sources`
- `document` — the artifact produced by the `generate_document` tool, when the turn generated one

That metadata is persisted by `POST /chats/{chat_id}/messages`, which is the only chat entry
point; the assistant message row carries `detected_lang`, `sources` and the generated
document. This is what allows the SPA to render citations and document downloads directly in
the conversation history instead of losing them after the immediate response.

> **Resolved.** The migration shipped with citations collected by running
> `retrieve_and_rerank()` a *second* time after the graph completed, which this report flagged
> as not the ideal architecture. That second pass is gone:
> `get_vectordb_search_sources_in_latest_turn()` reads the source metadata straight off the
> `vectordb_search` tool artifacts in the returned messages, so there is one retrieval pass per
> message. `get_generated_document_in_latest_turn()` reads the document artifact the same way.

#### Legacy compatibility path retired

> **Superseded.** The old-style `GET /chat` endpoint described here no longer exists. The
> `/chats*` routes are the only chat surface.

### 6.2 `backend/src/config/config.py`

This file was changed to make the migration configuration-safe and backward-compatible.

Important changes:

- `CLIENT_SECRET_FILE` is now read via:
  - `GOOGLE_CLIENT_SECRET_FILE`
  - fallback `CLIENT_SECRET_FILE`
  - fallback default `secrets/client_secret.json`
- Google scopes were expanded from only Drive readonly to:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`

Why these changes matter:

- the client secret path is now deployable in Docker and non-Docker environments without forcing one file location
- the expanded scopes match the actual data the backend and UI need when validating and identifying the connected account

The file also moved more environment reads through `get_env()`, which makes string cleanup and defaults more consistent than the previous direct `os.getenv()` usage.

### 6.3 `backend/src/config/auth.py`

This file is one of the most important pieces of the migration because it defines how source credentials and source preferences are persisted and read from SQL.

Key changes:

- added `set_selected_sources()`
- added `get_selected_sources()`
- added `get_selected_authenticated_sources()`
- hardened `get_authenticated_admin_sources()` and `get_authenticated_sources()`

> **Superseded.** The migration-era helpers `SOURCE_ALIASES`, `normalize_source_key()`,
> `_collapse_records()`, `_to_questdb_timestamp()` and `disconnect_source()` no longer
> exist. Provider keys are now the plain `DataSource.name` values registered in
> `SOURCES`, and `validate_source()` in `backend/server.py` is the single place that
> accepts or rejects a provider name.

#### Latest-row semantics over append-only credential history

Credential reads use `SELECT DISTINCT ON (user_id, source) ... ORDER BY user_id, source, issued_at DESC`.

In practice this means:

- the credentials table is append-only
- the newest non-expired row for a `(user_id, source)` pair is the authoritative state
- token refresh appends a new row rather than updating the old one

That avoids in-place mutation and keeps the storage model simple.

#### Timestamp handling

`normalize_timestamp()` converts timezone-aware timestamps to naive UTC before insert.

That matters because:

- OAuth credential expiry times are naturally timezone aware
- storing them consistently prevents refresh scheduling bugs caused by timezone mismatches

#### Source preference persistence

The new `source_preferences` integration separates two concepts that were previously easy to conflate:

- a provider is connected
- a provider is selected for chat

`set_selected_sources()` stores the selected provider list as JSON in SQL.

`get_selected_sources()` reads the latest stored value and is tolerant of problems — a
failed query, invalid stored JSON, a non-list payload or no row at all all return an empty
list.

> **Superseded.** The migration plan called for falling back to "treat connected sources as
> selected". The current code does not: an empty list means *nothing is selected*, so
> `can_chat` is false and the chat turn is refused. The SQL schema must therefore be
> provisioned in every deployed environment; `sql/init_tsdb.sql` does that.

### 6.4 `backend/src/config/sources.py`

During the migration this file limited active source registration to Google Drive only, so
that the backend and frontend could not pretend other providers were supported.

> **Superseded.** The registry now holds both providers, keyed by each connector's `name`:
>
> ```python
> SOURCES = {
>     GoogleDriveSource.name: GoogleDriveSource,   # "drive"
>     DropboxSource.name: DropboxSource,           # "dropbox"
> }
> ```
>
> The `SOURCE_LABELS` mapping was removed; the human-readable name lives on each connector
> as the `display_name` class attribute.

### 6.5 `backend/src/connectors/source.py`

The base `DataSource` model was extended with shared UI- and auth-related state so that
connector objects carry more than raw auth state.

What remains on the base class today is:

- `display_name` — the human-readable provider label
- `name` — the registry key
- `authenticated_principals` and `get_authenticated_principals()` — the ACL set used to
  build the Qdrant permission filter
- `login_info()` — the provider-specific data the SPA needs to start OAuth

> **Superseded.** `account_label` and `last_error` were never promoted to the base class in
> the final code. `account_label()` exists only on `DropboxSource`, and connector errors are
> logged rather than returned to the UI.

### 6.6 `backend/src/connectors/drive.py`

This file is the concrete Google Drive migration core.

Important changes:

- provider key changed to `drive`
- added `display_name = "Google Drive"`
- `login()` now loads Google authorized-user JSON into `google.oauth2.credentials.Credentials`
- `login()` refreshes credentials when needed
- `login()` creates the Drive API client and captures the account email
- `login()` populates authenticated principals for ACL-aware retrieval
- `refresh()` now rebuilds serialized credentials after refreshing tokens
- `refresh()` preserves `last_error` on failure
- `list_files()` now fails explicitly when no Drive root is configured

#### Drive login behavior

`login()` now does real validation work instead of being a stub:

- parse stored JSON
- build Google credentials
- refresh if expired and refresh token exists
- build the Drive API service
- call `about().get(...)` to confirm the account works
- store the email for UI display
- compute authenticated principals

If anything fails the connector state is reset and the failure is logged, and `login()`
returns `False`. (The `last_error` attribute from the migration plan was not kept; failures
are logged rather than surfaced through the API.)

This is what allows the rest of the backend to distinguish between:

- credentials existing in SQL
- credentials being actually usable

#### Permission model

The connector preserves the legacy ACL approach by generating normalized principals such as:

- `gdrive:user:<email>`
- `gdrive:group:<group>`
- `gdrive:domain:<domain>`
- `gdrive:anyone`

It also attempts to enrich user principals with group membership using the Google Admin SDK when available. That enrichment is best-effort:

- if it fails, the connector still returns the principals it can derive safely

#### Drive indexing root behavior

`list_files()` performs the core indexing work expected from the old implementation:

- BFS traversal from every id in `GDRIVE_ROOTS`, skipping ids listed in `GDRIVE_EXCLUDE`
- support for shared drives via `supportsAllDrives`
- MIME filtering to supported document types, applied server-side in the list query
- attachment of `webViewLink`
- attachment of normalized permission metadata

`GDRIVE_ROOTS` and `GDRIVE_EXCLUDE` are comma-separated sets built in
`backend/src/config/config.py`; an unset `GDRIVE_ROOTS` yields an empty set, so the traversal
simply indexes nothing.

### 6.7 `backend/src/utils/rag.py`

This file was updated to improve citation quality and source labeling.

Important changes:

- added `_resolve_source_label()`
- `retrieve_and_rerank()` now receives `sources` when calling `hybrid_search()`
- citation metadata uses human-readable provider labels such as `Google Drive`

The most important effect is that the source metadata persisted in chat messages is now fit for UI display:

- `title`
- `source_type`
- `link`

The old retrieval path could still return raw provider keys, which was good enough for internal use but not for a polished chat UI.

### 6.8 `backend/Dockerfile`

The backend Docker image definition was modernized to match the migrated backend.

Important changes:

- switched from `pip install -r requirements.txt` to `uv sync`
- copies `pyproject.toml` and `uv.lock`
- creates `/app/secrets`
- keeps the model download/bootstrap steps

Why this matters:

- dependency installation is now aligned with the current backend package definition
- `/app/secrets` is a clear mount target for the Google client secret file
- the image build captures the real runtime dependency graph more accurately

The file has since been reworked further. It is now a two-stage build on `python:3.10-slim`:
the builder runs `uv sync --frozen --no-dev` into `/opt/venv` and pre-downloads the stanza,
NLTK, glotlid and cross-encoder models (and the local embedding model when
`USE_LOCAL_EMB=true`); the runtime stage copies that venv, drops to a non-root `appuser`,
declares a `/healthz` healthcheck and starts the app directly with
`CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]` — `uv` is not in the
runtime image. `Dockerfile.rocm` and `Dockerfile.bench` are the AMD and benchmark variants.

The root `requirements.txt` still exists but is a leftover from the Streamlit client; nothing
in the build or the compose stack reads it.

### 6.9 `backend/pyproject.toml` and `backend/uv.lock`

The backend dependency definition now includes the packages required by the migrated backend and its language tooling.

One explicitly relevant addition to the Google Drive/chat migration is:

- `fasttext-numpy2-wheel>=0.9.2`

The dependency file also contains the Google auth and Drive libraries the new backend path depends on, including:

- `google-api-python-client`
- `google-auth`
- `google-auth-httplib2`
- `google-auth-oauthlib`

`uv.lock` is present and is the lockfile that matches the Dockerfile's `uv sync` install path.

### 6.10 Backend tests: current reality

The older summary file referenced a backend unit test file:

- `backend/tests/test_source_auth.py`

That file does **not** exist in the current repository state.

That was accurate when this report was written. A backend test suite has since been added
under `backend/tests/`, covering the chat document store, the deletion guard, document
generation and the artifact renderers, Dropbox principals, indexing progress, Qdrant
operations, reasoning effort, topic payloads and the VDB update endpoints.

There is still no `pytest` configuration and no `pytest` entry in `backend/pyproject.toml`;
the tests import as `src.*`, so they are run from `backend/` with a separately installed
`pytest`. Source-auth behaviour is not among the covered areas and still requires
live/manual verification.

## 7. SQL changes in detail

The SQL migration footprint for this Google Drive work is concentrated in one file, called
`sql/init.sql` at the time of the migration and **`sql/init_tsdb.sql`** today.

There are not multiple migration SQL files for this feature. The schema relevant to source
auth is defined directly in that file, which `timescaledb-init` re-applies on every start and
which is therefore written to be idempotent.

### 7.1 `credentials` table

The `credentials` table already existed and remains the source-of-truth table for stored provider credentials:

- `user_id`
- `source`
- `credentials`
- `issued_at`
- `needs_refresh_at`
- `expires_at`
- `is_admin`

How it is used now:

- `credentials` stores serialized provider-specific auth payloads, for Google Drive specifically the authorized-user JSON
- `issued_at` is the append-only event timestamp used to determine the newest record
- `needs_refresh_at` lets the periodic refresh job find tokens that should be refreshed before expiry
- `expires_at` lets reads ignore expired credentials
- `is_admin` identifies credentials that are eligible to drive the shared corpus reindex job

Operationally, the backend treats this table as an append-only event log. It does not update rows in place. Instead:

- connect writes a new valid credential row
- refresh writes a new refreshed credential row
- disconnect writes a new empty credential row

The latest valid row per `(user_id, source)` is what the backend uses when reconstructing authenticated sources.

### 7.2 `source_preferences` table

The main SQL schema addition for this migration is:

- `source_preferences`

Schema:

- `user_id`
- `selected_sources`
- `updated_at`

Purpose:

- store which connected providers the user wants active for chat

Why this table matters:

- connection state and selection state are not the same thing
- a user may have a provider connected but not want it active in a chat session
- the chat backend needs a stable persisted source-selection contract for `can_chat` and retrieval

Implementation details:

- `selected_sources` is stored as JSON text
- provider keys are normalized before storage
- reads use the latest row per user

> **Superseded.** Under QuestDB, `credentials` was partitioned by hour on `issued_at` and
> `source_preferences` by day on `updated_at`.

On TimescaleDB neither table is a hypertable; they are plain PostgreSQL tables with a
descending index that serves the latest-row read:

- `idx_credentials_user_source_issued` on `(user_id, source, issued_at DESC)`
- `idx_source_preferences_user_updated` on `(user_id, updated_at DESC)`

### 7.3 SQL behavior that the backend depends on

The Python auth layer currently assumes the following SQL semantics:

- `credentials` exists and can store multiple historical rows per user/source
- `source_preferences` exists

`get_selected_sources()` swallows a read failure and returns an empty list, so a missing or
unreadable `source_preferences` table means **no source is selected**, not "every connected
source is selected": chat then refuses the turn because the user has no selected sources.
The table is created by `sql/init_tsdb.sql`, so this only bites a database that was never
initialized.

## 8. Frontend changes summary

The frontend changes are important, but they are summarized more lightly here because the main complexity of the migration lived in the backend and SQL layers.

### 8.1 Chat route and callback routing

Important files:

- `frontend/src/routes/chat.tsx`
- `frontend/src/routes/chat.provider-callback.tsx`

Current behavior:

- `/chat` is the main SPA chat route
- `/chat/provider-callback` is the OAuth callback route, now shared by Google Drive and
  Dropbox: `resolveCallbackOutcome()` matches the returned `state` against the pending
  request of either provider
- the parent chat route correctly renders the callback child route through `<Outlet />`
- the callback route validates `state`, handles `error` and `error_description`, posts the auth code to the backend, clears stored OAuth request state, and redirects using `globalThis.location.replace(...)`

### 8.2 Frontend OAuth helpers

Important files:

- `frontend/src/features/chat/google-drive-auth.ts`
- `frontend/src/features/chat/dropbox-auth.ts` (added with the Dropbox connector; same shape,
  plus `token_access_type=offline` so a refresh token comes back)

What they do:

- builds the Google Drive authorization URL
- stores callback request state in `sessionStorage`
- normalizes the return path
- prevents the callback route itself from being reused as a post-auth destination

### 8.3 Source management UI

Important files:

- `frontend/src/features/chat/api.ts`
- `frontend/src/features/chat/sources-panel.tsx`
- `frontend/src/features/chat/types.ts`

What changed:

- source status is fetched from the backend
- selection actions call the backend contract

> **Superseded.** The panel is no longer Drive-only: it renders one card per provider, Google
> Drive and Dropbox, from a shared provider descriptor. There is no disconnect action, and
> `last_error` and backend-provided reindex-availability messages are not part of the API, so
> they are not shown. Indexing is driven instead by the admin-only
> `useStartVdbUpdateMutation` / `useStopVdbUpdateMutation` hooks and the
> `useVdbUpdateStatusQuery` poll in `frontend/src/features/chat/api.ts`, with run progress
> rendered separately by `frontend/src/features/indexing-progress/`.

### 8.4 Chat UI and citations

Important files:

- `frontend/src/features/chat/chat-page.tsx`
- `frontend/src/features/chat/conversation-view.tsx`
- `frontend/src/i18n/messages/en.json`
- `frontend/src/i18n/messages/es.json`
- `frontend/src/i18n/messages/gl.json`

What changed:

- the chat page now uses backend source status to gate chat availability
- the sources panel is integrated into the chat page
- assistant messages render a `Sources` section when citation metadata is present
- citation cards show title, type, and external link
- the i18n files include source-panel and citation-related labels

Added after this report: assistant messages that carry a generated document render a download
affordance, backed by `frontend/src/features/chat/chat-document.ts` and
`GET /chats/{chat_id}/messages/{message_id}/document`.

### 8.5 Small follow-up TypeScript fix

As a later follow-up, the SPA also corrected no-payload mutation calls so they now pass `undefined` to `mutateAsync(...)` where TanStack Query expected a variables argument type. This affects the current state of:

- `frontend/src/features/chat/chat-page.tsx`
- `frontend/src/features/chat/sources-panel.tsx`

## 9. What was validated during this documentation update

> **Historical.** This section records what was run when the migration report was written.
> It has not been rerun since, and the suites have grown a long way past the numbers below:
> the frontend now has 28 Vitest files plus one Playwright spec, and `backend/tests/`
> holds 12 test modules.

The following validations were freshly rerun at the time:

### Frontend

- `cd frontend && pnpm test && pnpm build`

Results:

- `vitest` passed
- suite contained 7 passing tests across 2 files
- the production build passed

### Backend

- Python compile validation across all `backend/**/*.py` files using `python3` and `py_compile`

Result:

- backend compile check passed

## 10. What has been code-reviewed but not live-validated

The following is implemented in code but still needs real environment validation:

- Google OAuth callback end to end with real Google credentials
- Drive connection using a real client secret and real browser redirect
- admin-triggered shared reindex against real Drive content
- non-admin restrictions and UX messages in a real session
- ACL filtering across at least two different users
- real citation accuracy against indexed Drive files
- token refresh timing against real expiring Google credentials

The Dockerfile and dependency setup were also reviewed but not rerun as part of this doc merge pass.

## 11. Remaining migration gaps and known limitations

The remaining pending item is still end-to-end live verification.

Concrete checks still needed:

1. Connect Google Drive with a real account.
2. Verify the callback route redirects back to the intended chat route.
3. Start indexing as an admin and follow the run through `GET /indexing/progress`.
4. Confirm a non-admin cannot start or stop indexing.
5. Send chat messages and confirm citations render correctly.
6. Validate that two users with different Drive permissions do not see the same protected content.

(Step 3 originally read "confirm the connected account label appears in the source panel";
the API no longer returns an account label, so there is nothing to check there.)

Known implementation limitations:

- there is no backend automated test coverage for source auth

Three limitations listed here have since been resolved:

- citation metadata no longer needs a second retrieval pass; it is read from the tool
  artifacts of the turn
- shared reindex job status is now persisted in the `indexing_progress` table, so it survives
  a restart
- the provider registry is no longer Drive-only: `SOURCES` registers both
  `GoogleDriveSource` and `DropboxSource`

## 12. Bottom-line status

The migration is no longer just a plan. The FastAPI backend and the React chat UI now contain the main Google Drive migration path:

- backend-managed OAuth exchange
- SQL-backed credential and source-selection persistence
- shared admin-managed Drive indexing
- ACL-aware retrieval
- persisted chat history
- citation metadata in assistant messages
- Drive connection and citation rendering in the SPA

What remains is not broad implementation work, but live verification and a few follow-up hardening tasks.
