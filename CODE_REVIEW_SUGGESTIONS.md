# Code Review — Suggested Improvements

Review date: 2026-07-18 (branch `dev`, commit `3e808ea`)

## Implementation status (2026-07-18)

**Implemented:** all of §1 (bugs 1.1–1.8), §2.1 (annotation + typed JSON parsing), §2.2 (bare excepts), §2.3 (append-only tables now clean up superseded rows atomically; role cache TTL is env-configurable via `LOGTO_ROLE_CACHE_TTL_SECONDS`), §2.5 (periodic loops use an interruptible stop event and no longer die on a failed iteration), §2.6 (all items; `VDB_LOCK` now lives on the persistent data volume, overridable via `VDB_LOCK_PATH`), §4 (21 backend unit tests in `backend/tests/`, `ruff` config in `backend/pyproject.toml`, unused-import cleanup across the codebase), §5 (dep dedup, conditional Content-Type, failed sends no longer persist an orphaned user message — fixed backend-side).

**Deliberately not implemented** (design/product decisions, listed in §2.4 and §3): credential encryption at rest, dashboard query batching/caching, batched LLM relevance filtering, response streaming, and localized backend error messages. These change behavior or need infrastructure choices and should be scheduled as their own work items.

Behavior notes for deployment:
- The VDB lock file moved from the container CWD to the data volume: indexing enabled/disabled state now survives restarts. After deploying, an admin may need to toggle indexing once.
- Token refresh now runs regardless of whether VDB indexing is enabled.
- `credentials` and `source_preferences` retain only the latest row per user/source going forward (old rows are removed as new ones are written).

---

Scope: backend (FastAPI + LangGraph + Qdrant/TimescaleDB) and frontend (React/TanStack). Findings are ordered by severity. File references use `path:line`.

---

## 1. Bugs (high priority)

### 1.1 Refreshed credentials are stored without expiry metadata, breaking the refresh cycle
`backend/server.py:212` — in the `refresh_tokens` periodic job, refreshed credentials are re-inserted with:

```python
add_credentials(pg_pool, user_id, source.name, new_creds, is_admin)
```

Unlike `/login-source` (`server.py:351-361`), this call omits `needs_refresh_at` and `expires_at`, so they are stored as `NULL`. Consequences:

- `get_credentials_to_refresh` requires `needs_refresh_at IS NOT NULL`, so a credential that has been refreshed **once will never be refreshed again** and will silently go stale.
- `expires_at IS NULL` is treated as "never expires" by all credential queries, so the stale row keeps being selected forever.

**Fix:** call `source.expiry()` after a successful refresh and pass both timestamps, same as the login endpoint.

### 1.2 `os.delete` does not exist — deleting stale TreeDex indexes always crashes
`backend/src/connectors/store.py:242`:

```python
os.delete(index_path)   # AttributeError: module 'os' has no attribute 'delete'
```

This raises `AttributeError` the first time a file with a long-context index is removed or modified, aborting the whole VDB update job (caught in `run_vdb_update_once`, so every subsequent run fails at the same point). **Fix:** use `os.remove(index_path)`. This path is clearly never exercised by tests — see §4 (no backend tests).

### 1.3 Token refresh only runs while VDB indexing is active
`backend/server.py:191` — `refresh_tokens` starts with `if os.path.isfile(VDB_LOCK)`. The lock file signals "VDB indexing enabled", but the check gates **user credential refresh** as well. If an admin stops indexing (`/stop-vdb-update` removes the lock), all users' OAuth tokens stop being refreshed and chat logins silently expire. If the coupling is intentional, it deserves a comment; otherwise remove the check from the refresh job.

### 1.4 Synchronous, blocking work inside `async def` endpoints
Nearly every endpoint is declared `async def` but performs blocking I/O directly on the event loop:

- `_run_chat_turn` (`server.py:495`) calls `build_sources_status` and `get_selected_authenticated_sources`, which do synchronous psycopg2 queries **and live OAuth logins per source** (`src/config/auth.py:122-136`).
- All metrics endpoints run 4–14 sequential synchronous queries (`_fetch_shared_metrics_data`, `server.py:628`).
- `validate_token` (dependency for every request) does synchronous `requests` calls for OpenID config/JWKS and the Logto management API (`src/config/logto_auth.py`, `logto_management.py`).

One slow query or a slow Logto/Google endpoint stalls **all** concurrent requests. **Fix options:** declare these endpoints as plain `def` (FastAPI runs them in a threadpool), wrap blocking calls in `asyncio.to_thread`, or migrate metrics reads to the already-existing `async_pg_pool`.

### 1.5 A metrics DB failure turns a successful chat turn into a 500
`backend/src/metrics/metrics.py:178-184` — `TimedMetric.__exit__` calls `insert_metric` unguarded. It wraps the graph invocation in `_run_chat_turn` (`server.py:539`), so if the metrics insert fails (DB hiccup, pool exhausted) *after the LLM answered successfully*, the exception propagates and the user gets an error even though the answer exists. Metrics recording should never fail the request — wrap the insert in `try/except` with a warning log (as `record_token_usage_metrics` already does).

### 1.6 `join_contiguous_chunks` can raise `IndexError` on short documents
`backend/src/connectors/search.py:106`:

```python
metadata=docs[PREV_CHUNKS].metadata  # Take central chunk
```

If a contiguous group has fewer than `PREV_CHUNKS + 1` chunks (single-chunk document, or the anchor is chunk 0 so there are no previous chunks to fetch), this indexes past the end of the list. Also, the "central chunk" assumption is wrong whenever the anchor sits near the start of a document. **Fix:** `docs[min(PREV_CHUNKS, len(docs) - 1)].metadata`, or carry the anchor explicitly.

### 1.7 `extract_topics` runs the expensive extraction even when `CALCULATE_TOPICS` is off
`backend/src/connectors/store.py:413-426` — `extract_initial_topics` (LLM-driven topic modeling over the whole VDB) is executed unconditionally once the chunk threshold is met; `CALCULATE_TOPICS` only controls whether the manifest records it. As written, with the flag off, the extraction re-runs on **every** VDB update and its results are never marked done. The flag check should gate the extraction itself.

### 1.8 `build_vectordb_from_sources` passes `None` into `extract_topics` when there are no sources
`backend/src/connectors/store.py:111-119` — `vectordb` stays `None` if `grouped_files` is empty (no admin sources connected), then `extract_topics(llm, None)` is called. If the manifest reports enough chunks (from a previous run), `extract_initial_topics(llm, None, ...)` will crash. Guard the empty case explicitly.

---

## 2. Robustness & design

### 2.1 `vectordb_search` return type is inconsistent
`backend/graph/tools.py:25` is annotated `-> str` but returns a `dict` on the success path and plain strings on error/no-results paths. The consumer (`get_vectordb_search_output_in_latest_turn`, `server.py:471`) then `json.loads` the ToolMessage content and relies on a bare `except` to absorb the string cases. This works only because LangGraph's `ToolNode` happens to `json.dumps` dict outputs. Return a single structured shape for all paths (e.g. `{"chunks": [...], "sources": [...], "error": str | None}`) and fix the annotation.

### 2.2 Bare `except:` clauses swallow real errors
- `backend/server.py:315` — `os.remove(VDB_LOCK)`: catch `FileNotFoundError` only.
- `backend/server.py:473` — `json.loads`: catch `json.JSONDecodeError`.
- `backend/src/connectors/drive.py:402` — silently drops any file whose metadata processing throws (`KeyError`, permission API error, …). At minimum log the file id; a Drive API blip currently deletes documents from the index silently on the next sync (the file disappears from `list_files`, so it is treated as removed).

### 2.3 Append-only tables grow without bound
- `credentials` (`src/config/auth.py:17`) — every login/refresh inserts a new row; queries take `DISTINCT ON ... ORDER BY issued_at DESC`. Refresh runs every 5 minutes, so this grows quickly.
- `source_preferences` (`src/config/auth.py:86`) — same pattern per selection change.
- `_USER_ROLE_CACHE` (`src/config/logto_management.py:18`) — unbounded in-memory dict.

Consider `INSERT ... ON CONFLICT DO UPDATE` (upsert on `(user_id, source)`), or a periodic cleanup of superseded rows.

### 2.4 OAuth credentials stored in plaintext
The `credentials` column stores raw OAuth tokens/refresh tokens as text. Anyone with DB access can impersonate every connected Drive/Dropbox account. Consider at-rest encryption (e.g. Fernet with a key from the secrets mount) or at least documenting the trust assumption.

### 2.5 Graceful-shutdown of periodic tasks doesn't actually stop them
`server.py:129` — jobs are infinite `while True: ... time.sleep(interval)` loops (`periodic_task`, `src/utils/helpers.py:119`) run via `asyncio.to_thread`. `task.cancel()` cannot interrupt a running thread, so shutdown blocks until each thread's current `sleep` finishes (up to ~2h for the VDB job). Also note the inter-process lock is held **during** the sleep, which may or may not be intended. Use a `threading.Event` and `event.wait(interval)` so shutdown can signal the loops, and release the lock before waiting.

### 2.6 Misc backend
- `server.py:266` — comment says "Once an hour" but the interval is 7000 s (~1 h 57 m).
- `src/connectors/store.py:27` — `VDB_LOCK = 'vdb.lock'` is a relative path; behavior depends on the process CWD. Make it absolute (e.g. under `QDRANT_META_PATH`).
- `server.py:39` — `from src.model.endpoints import *` hides where names come from; import explicitly.
- `server.py:683-688` — `validate_source` is defined with no blank lines before the `@app.get` decorator below it; move helpers above the endpoint section.
- `src/utils/rag.py:1-16` — duplicate imports (`BaseModel`, `Field`, `Optional` twice) and several unused ones (`ChatOpenAI`, `AIMessage`, `TimedMetric`, `insert_metric`, `register_topics`, `register_user_activity`, `register_words`, `extract_search_terms`, `resolve_topic_names`). Enable `ruff` (see §4).
- `src/connectors/store.py:342` — `flush("lote")` mixes Spanish into English log values; pick one language for logs.
- `backend/benchmark.py:93` — leftover debug `print("STARTING 5")`.
- `src/metrics/metrics.py:76` — comment says "3 for each word" but 4 params are appended.
- `/healthz` (`server.py:176`) only checks attribute presence; it will report `ok` while the DB is down. Consider a cheap `SELECT 1` (possibly cached a few seconds).
- `_build_filter_conditions` (`src/metrics/dashboard_queries.py:57`) uses `ts <= end_date + 1 day`; that boundary should be strict (`ts < %s`) or events at exactly midnight of the following day are included.
- `extract_usage_metrics` (`server.py:287`) only reports GPU 0; aggregate or label per GPU if multi-GPU nodes are expected.

---

## 3. Performance

- **Dashboard fan-out:** `/metrics/dashboard` runs ~15 sequential queries per request (`server.py:628-659`). With the frontend polling/refetching, this multiplies. Batch related aggregates into fewer queries (many share the same `WHERE` clause), run them concurrently on the async pool, and/or cache the response for 15–30 s.
- **Per-request Logto management call:** `validate_token` hits the management API per user with only a 60 s TTL (`logto_management.py:17`). Consider a longer TTL, or trusting token role claims and refreshing roles out-of-band.
- **Per-chunk LLM relevance filter:** `vectordb_search` (`graph/tools.py:53-58`) issues one LLM call per retrieved chunk. It is bounded by the rerank `top_k=6`, but that's still up to 6 extra LLM round-trips per query. A single batched judgment call (all chunks in one prompt with structured output) would cut latency substantially.
- **No response streaming:** `/chats/{chat_id}/messages` waits for the full graph run, so users stare at a spinner for the entire LLM + RAG latency. Consider SSE/WebSocket streaming (LangGraph supports `astream_events`); it also removes the proxy-timeout risk on long turns.

---

## 4. Testing & tooling

- **The backend has zero tests.** The frontend has good coverage (component + e2e), but none of the logic in §1 (auth queries, credential refresh, chunk joining, chat store) is exercised. Bugs like `os.delete` (§1.2) would be caught by a single unit test. Suggested starting set: `PostgresChatStore` (with a throwaway PG container), `split_contiguous`/`join_contiguous_chunks`, `build_query_params`/filter builders, `validate_token` (mocked JWKS), and the `refresh_tokens` credential path.
- **No Python linting/formatting config** was found (`ruff`/`flake8`/`black`). `ruff check` would flag the bare excepts, unused/duplicate imports, and the `os.delete` bug (`F821`-class checks) immediately. Add it to CI alongside the frontend's `vp check`.
- `requirements.txt` at repo root: consider pinning with a lock (e.g. `uv`/`pip-tools`) for reproducible backend builds.

---

## 5. Frontend (minor — overall in good shape)

The frontend is clean: typed API layer, sensible React Query usage with optimistic updates, i18n, and solid test coverage. Only small items:

- `package.json` lists `@tanstack/router-plugin` in **both** `dependencies` and `devDependencies`; keep one (devDependencies, since it's a build-time plugin).
- `useAuthorizedChatRequest` (`src/features/chat/api.ts:35-37`) always sets `Content-Type: application/json`, including on GET/DELETE requests; harmless but unnecessary.
- Error messages from the backend `detail` field are shown verbatim to users (`api.ts:48`); backend 500 details are English/technical while the UI is localized — consider mapping known status codes to translated messages.
- `chat-page.tsx` recovery after a failed send restores composer text but the persisted user message (already stored server-side before the turn ran, see `server.py:585`) will reappear on refetch, so a retry produces a duplicate user message. Aligning with the backend (e.g. only persist the user message when the turn succeeds, or mark it failed) would make retries clean.

---

## Summary of highest-impact actions

| # | Action | Ref |
|---|--------|-----|
| 1 | Pass `expiry()` timestamps when re-inserting refreshed credentials | §1.1 |
| 2 | `os.delete` → `os.remove` | §1.2 |
| 3 | Decouple token refresh from the VDB lock file | §1.3 |
| 4 | Move blocking DB/HTTP work off the event loop | §1.4 |
| 5 | Make metrics recording non-fatal (`TimedMetric.__exit__`) | §1.5 |
| 6 | Fix `join_contiguous_chunks` index-out-of-range | §1.6 |
| 7 | Gate topic extraction on `CALCULATE_TOPICS` | §1.7 |
| 8 | Add backend tests + `ruff` to CI | §4 |
