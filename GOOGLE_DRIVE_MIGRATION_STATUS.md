# Google Drive migration report

This document is the consolidated migration report for the Google Drive provider and chat UI migration from the legacy Streamlit app into the current FastAPI backend and React SPA.

It replaces the earlier split between `GOOGLE_DRIVE_CHANGES_SUMMARY.md` and the previous `GOOGLE_DRIVE_MIGRATION_STATUS.md`. The content below has been checked against the current codebase so it reflects the actual current state of the migration rather than an earlier stop point.

## 1. Goal and scope

The migration goal is to preserve the Google Drive-backed chat experience from the legacy Streamlit app while moving the application to:

- a FastAPI backend in `backend/`
- a React SPA in `frontend/`

The current scope is intentionally narrow:

- Google Drive is the only provider that must work
- the chat flow that depends on Google Drive must work
- `mecopia/` and `mecopia-web-backend/` are used only as UI/UX references
- attachments, streaming, Dropbox, OneDrive, and the rest of Mecopia's runtime architecture are explicitly out of scope for now

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
- credentials are stored in QuestDB-backed tables
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

The backend now exposes richer source state through these response models:

- `SourceProviderStatusModel`
- `ReindexStatusModel`
- `SourcesStatusModel`

The important additions are:

- `oauth_client_id` so the frontend can start Google OAuth without hardcoding Google client settings
- `account_label` so the UI can show the connected Drive identity
- `last_error` so broken stored credentials or failed refresh/login attempts are surfaced to the UI
- `reindex.available` so the frontend can disable the action for the correct reason
- `reindex.message` so the UI can show *why* reindex is unavailable

This is a major improvement over the earlier state where the frontend had less context and had to infer too much from a simple connected/disconnected flag.

#### Backend-managed Google OAuth exchange

The backend now owns the actual authorization-code exchange for Drive via:

- `_get_drive_client_config()`
- `_get_drive_oauth_client_id()`
- `_build_drive_flow()`
- `_validate_redirect_uri()`
- `POST /sources/{provider}/connect`

The flow works like this:

1. The frontend builds the Google authorization URL using the backend-supplied client id.
2. Google redirects back to the SPA callback route.
3. The SPA sends `code` and `redirect_uri` to `POST /sources/drive/connect`.
4. The backend validates the redirect URI origin against the configured allowed frontend origins.
5. The backend exchanges the code through `google_auth_oauthlib.flow.Flow`.
6. The backend serializes the credentials and computes:
   - `needs_refresh_at`
   - `expires_at`
7. The backend instantiates a Drive source with those credentials and calls `login()` to verify the account really works before persisting anything.
8. If validation succeeds, the credentials are stored and the provider is auto-selected for the user.

Important implementation detail:

- the backend no longer depends on a single static `REDIRECT_URI` value from config
- instead, the frontend sends the redirect URI used for the request and the backend validates the origin

That is a better fit for SPA-based OAuth and avoids coupling the backend to a single hardcoded callback URL.

#### Source connection, selection, and disconnection

The backend now supports these source-management operations cleanly:

- `GET /sources/status`
- `PUT /sources/selection`
- `POST /sources/{provider}/connect`
- `POST /sources/{provider}/disconnect`

The important behaviors are:

- only known providers are accepted through `_validate_provider()`
- only connected providers can be selected
- disconnect writes a new empty credential record rather than mutating old rows
- after disconnect, `source_preferences` is updated so the disconnected provider is removed from the selected set

The disconnect behavior is especially important. Instead of deleting history, the backend appends a new empty credentials row. Combined with the "latest record wins" retrieval logic in `config/auth.py`, this means:

- old valid rows are preserved for audit/history
- the new latest row marks the provider as effectively disconnected
- reads will no longer treat the old credentials as current

#### Shared admin-managed reindex semantics

One of the biggest migration fixes was the reindex model.

The backend now treats reindex as a shared operation through:

- `_get_shared_reindex_job()`
- `_has_connected_admin_source()`
- `_build_reindex_status()`
- `_run_shared_reindex()`
- `POST /sources/reindex`

The current behavior is:

- reindex is admin-only
- reindex is blocked unless `GDRIVE_ROOT` is configured
- reindex is blocked unless the system has a non-empty stored admin credential record for Google Drive
- a single shared reindex job state is kept in `app.state.source_reindex_jobs`
- the actual rebuild runs in the background with `asyncio.create_task(asyncio.to_thread(...))`

The user-facing availability message is computed before the click, which lets the frontend explain whether the problem is:

- user is not an admin
- Google Drive root is not configured
- there is no admin-connected Drive account available for the shared corpus

This is a direct correction of the earlier mixed behavior where per-user initiated reindexing could conflict with a shared vector store.

Important limitation to keep in mind:

- the shared reindex job state is in process memory
- if the backend restarts, the in-memory progress/error timestamps are lost

That does not break indexing itself, but it does mean the reindex status is not durable across process restarts.

#### Chat execution and citation persistence

The backend chat path now persists richer assistant message metadata.

The central function is `_run_chat_turn()`:

- it loads the user's currently selected authenticated sources
- it refuses chat if the user has no connected/selected sources
- it invokes the graph with:
  - thread id
  - vector store
  - reranker
  - QuestDB pool
  - authenticated source objects
- after the graph returns, it runs `retrieve_and_rerank()` again to collect source metadata for UI persistence

The result returned by `_run_chat_turn()` now includes:

- `answer`
- `detected_lang`
- `sources`

That metadata is then persisted in:

- `POST /chats/{chat_id}/messages`
- the legacy `GET /chat`

Assistant messages now store metadata in the chat store with:

- `detected_lang`
- `sources`

This is what allows the SPA to render citations directly in the conversation history instead of losing them after the immediate response.

Important implementation note:

- citations are currently collected by performing retrieval a second time after the graph completes
- this is functional and preserves feature parity
- it is not the ideal final architecture

The cleaner future version would pass the retrieved source metadata through the graph itself so there is only one retrieval pass per message.

#### Legacy compatibility path retained

The old-style `GET /chat` endpoint is still present for compatibility, but it now also returns:

- `sources`
- `detected_lang`

That keeps the migration safer while the SPA is being completed and reduces pressure to remove legacy consumers immediately.

### 6.2 `backend/src/config/config.py`

This file was changed to make the migration configuration-safe and backward-compatible.

Important changes:

- `CLIENT_SECRET_FILE` is now read via:
  - `GOOGLE_CLIENT_SECRET_FILE`
  - fallback `CLIENT_SECRET_FILE`
  - fallback default `secrets/client_secret.json`
- `GDRIVE_ROOT` now falls back to legacy `FOLDER_ID`
- Google scopes were expanded from only Drive readonly to:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `openid`
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`

Why these changes matter:

- the client secret path is now deployable in Docker and non-Docker environments without forcing one file location
- the `FOLDER_ID` fallback keeps old environment setups working while the project transitions to `GDRIVE_ROOT`
- the expanded scopes match the actual data the backend and UI need when validating and identifying the connected account

The file also moved more environment reads through `get_env()`, which makes string cleanup and defaults more consistent than the previous direct `os.getenv()` usage.

### 6.3 `backend/src/config/auth.py`

This file is one of the most important pieces of the migration because it defines how source credentials and source preferences are persisted and read from SQL.

Key changes:

- added `SOURCE_ALIASES`
- added `normalize_source_key()`
- added `_collapse_records()`
- added `_to_questdb_timestamp()`
- added `disconnect_source()`
- added `set_selected_sources()`
- added `get_selected_sources()`
- added `get_selected_authenticated_sources()`
- hardened `get_authenticated_admin_sources()` and `get_authenticated_sources()`

#### Provider key normalization

The migration moved the Drive provider identity toward the normalized key `drive`.

`SOURCE_ALIASES` and `normalize_source_key()` preserve compatibility with older forms such as:

- `GDrive`
- `Drive`
- `gdrive`

This matters because existing SQL rows may still carry old provider names. Without normalization, the migration could silently lose access to already stored credentials.

#### Latest-row semantics over append-only credential history

Credential reads use QuestDB's `LATEST ON ... PARTITION BY ...` semantics plus `_collapse_records()`.

In practice this means:

- the credentials table is append-only
- the newest row for a `(user_id, source)` pair is the authoritative state
- disconnect is represented by writing a newer empty credential row

That is a safe migration pattern because it avoids in-place mutation and keeps the storage model simple.

#### Timestamp handling

`_to_questdb_timestamp()` normalizes timezone-aware timestamps to naive UTC timestamps before insert.

That matters because:

- OAuth credential expiry times are naturally timezone aware
- QuestDB expects a timestamp representation that is compatible with its insert behavior
- storing them consistently prevents refresh scheduling bugs caused by timezone mismatches

#### Source preference persistence

The new `source_preferences` integration separates two concepts that were previously easy to conflate:

- a provider is connected
- a provider is selected for chat

`set_selected_sources()` stores the selected provider list as JSON in SQL.

`get_selected_sources()` reads the latest stored value and is intentionally tolerant of problems:

- if the table does not exist, it returns `None`
- if the stored JSON is invalid, it returns `None`
- if no row exists, it returns `None`

When `None` is returned, the backend falls back to treating connected sources as selected.

That graceful fallback is useful during rollout, but it also means the SQL schema should still be provisioned properly in all deployed environments.

### 6.4 `backend/src/config/sources.py`

This file now limits active source registration to Google Drive only:

- `SOURCES = {GoogleDriveSource.name: GoogleDriveSource}`

It also adds:

- `SOURCE_LABELS`

This matters because the current migration scope is explicitly Google Drive only. Reducing the active provider registry prevents the backend and frontend from pretending Dropbox or other providers are currently supported in the migrated experience.

### 6.5 `backend/src/connectors/source.py`

The base `DataSource` model was extended with shared UI- and auth-related state:

- `display_name`
- `account_label`
- `authenticated_principals`
- `last_error`

This is important because backend source status and frontend UI messaging depend on connector objects carrying more than just raw auth state. The migration now uses those properties for:

- provider labels
- connected account display
- ACL filtering support
- surfacing auth/debug errors in the UI

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

If anything fails:

- connector state is reset
- `last_error` is set
- the failure is logged

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

`list_files()` now explicitly raises when no indexing root is configured. That is an important migration safety improvement because a misconfigured deployment now fails loudly instead of behaving ambiguously.

The method still performs the core indexing work expected from the old implementation:

- BFS traversal under the configured Drive root
- support for shared drives via `supportsAllDrives`
- MIME filtering to supported document types
- attachment of `webViewLink`
- attachment of normalized permission metadata

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

- switched from `pip install -r requirements.txt` to `uv sync --no-dev`
- copies `pyproject.toml` and `uv.lock`
- creates `/app/secrets`
- keeps the model download/bootstrap steps
- runs the app through `uv run uvicorn`

Why this matters:

- dependency installation is now aligned with the current backend package definition
- `/app/secrets` is a clear mount target for the Google client secret file
- the image build captures the real runtime dependency graph more accurately

This file was reviewed during the documentation audit. It was not re-built as part of this doc merge pass, so the Docker behavior is code-reviewed here rather than freshly re-validated.

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

Also:

- no backend `pytest` configuration was found
- no backend automated test suite was available to rerun during this documentation update

So the accurate statement is:

- backend code has been syntax-validated and code-reviewed
- backend source-auth behavior still requires live/manual verification

## 7. SQL changes in detail

The SQL migration footprint for this Google Drive work is concentrated in:

- `sql/init.sql`

There are not currently multiple migration SQL files for this feature. The schema relevant to source auth is defined directly in `sql/init.sql`.

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

QuestDB-specific behavior:

- `credentials` is partitioned by hour on `issued_at`
- `source_preferences` is partitioned by day on `updated_at`

That partitioning matches the event-log style write pattern used by the backend.

### 7.3 SQL behavior that the backend depends on

The Python auth layer currently assumes the following SQL semantics:

- `credentials` exists and can store multiple historical rows per user/source
- `source_preferences` exists for full functionality
- if `source_preferences` does not exist yet, the backend falls back gracefully by treating connected sources as selected

That fallback is useful during rollout, but it should not be treated as the desired steady state. Production environments should provision `source_preferences` so selection behavior is explicit and durable.

## 8. Frontend changes summary

The frontend changes are important, but they are summarized more lightly here because the main complexity of the migration lived in the backend and SQL layers.

### 8.1 Chat route and callback routing

Important files:

- `frontend/src/routes/chat.tsx`
- `frontend/src/routes/chat.provider-callback.tsx`

Current behavior:

- `/chat` is the main SPA chat route
- `/chat/provider-callback` is the Google Drive OAuth callback route
- the parent chat route correctly renders the callback child route through `<Outlet />`
- the callback route validates `state`, handles `error` and `error_description`, posts the auth code to the backend, clears stored OAuth request state, and redirects using `globalThis.location.replace(...)`

### 8.2 Frontend OAuth helpers

Important file:

- `frontend/src/features/chat/google-drive-auth.ts`

What it now does:

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
- reindex status is polled while a rebuild is running
- provider `last_error` is shown in the UI
- reindex unavailability is explained with backend-provided messages
- the panel is currently Drive-only
- selection, disconnect, and reindex actions call the new backend contract

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

### 8.5 Small follow-up TypeScript fix

As a later follow-up, the SPA also corrected no-payload mutation calls so they now pass `undefined` to `mutateAsync(...)` where TanStack Query expected a variables argument type. This affects the current state of:

- `frontend/src/features/chat/chat-page.tsx`
- `frontend/src/features/chat/sources-panel.tsx`

## 9. What was validated during this documentation update

The following validations were freshly rerun:

### Frontend

- `cd frontend && pnpm test && pnpm build`

Results:

- `vitest` passed
- current suite contains 7 passing tests across 2 files
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
3. Confirm the connected account label appears in the source panel.
4. Run reindex as an admin.
5. Confirm a non-admin cannot reindex and sees the explanatory message.
6. Send chat messages and confirm citations render correctly.
7. Validate that two users with different Drive permissions do not see the same protected content.

Known implementation limitations:

- citation metadata is collected through a second retrieval pass after graph execution
- shared reindex job status is stored in memory, so restart resets the visible job state
- there is no backend automated test suite yet for source auth and reindex behavior
- only Google Drive is active in the migrated provider registry by design

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
