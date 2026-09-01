# Dropbox Connector

How the Dropbox source works, and everything needed to create the Dropbox app it
runs on.

Each user connects their own Dropbox account, exactly like the Google Drive
connector. **No Dropbox team admin is required** — not to create the app, not to
authorize it, not to index. The connector deliberately uses no Team API endpoint
and no team scope, because a single team scope would make the app team-scoped and
Dropbox would then reject authorization from anyone who is not a Dropbox Business
team admin.

Relevant files:

- `backend/src/connectors/dropbox.py` — the connector
- `backend/src/connectors/source.py` — the `DataSource` contract it implements
- `backend/src/config/auth.py` — how a source instance is bound to a user
- `backend/tests/test_dropbox_principals.py` — permission logic tests

---

## 1. The Central Idea: Folders Are The Permission

In an enterprise Dropbox team, folders are shared with **groups**, so a file's
ACL contains group ids. Storing those group ids would mean having to answer "is
this user in that group?" at query time — and group membership is only readable
through the Team API, which needs a team-scoped app and therefore a Dropbox
admin.

The connector sidesteps the question entirely. Instead of recording *who* can
read a file, it records **which shared folder the file lives in**:

```
index time   file  ->  dropbox:folder:<parent_shared_folder_id>
query time   user  ->  { dropbox:folder:<id> for every folder they can open }
```

Dropbox itself decides effective access, so individual grants, group grants, team
folder membership and nested inheritance all collapse into a single question:
*is this folder in my list?* One paginated `sharing_list_folders()` call with the
user's own token answers it.

This is why the connector needs no Team API, no admin, and no group resolution —
and it is also cheaper than reading member lists, because
`parent_shared_folder_id` already arrives free in the file listing.

## 2. How It Compares To Google Drive

Both connectors implement the same `DataSource` interface and produce the same
metadata.

| | Google Drive | Dropbox |
| --- | --- | --- |
| Who authorizes | every user, for themselves | every user, for themselves |
| Root config | folder **IDs** (`GDRIVE_ROOTS`) | folder **paths** (`DROPBOX_ROOTS`) |
| Traversal | client-side BFS over folder IDs | one server-side recursive listing per root |
| MIME filter | server-side query | inferred from the file extension |
| ACL granularity | per file, expanded to users/groups/domain | per shared folder, by folder id |
| Group support | needs Admin SDK (domain admin) | implicit, no extra API |

---

## 3. Request Flow

### Connecting

1. A user opens the Sources panel and clicks **Connect Dropbox**.
2. The browser runs the Dropbox authorization-code flow
   (`frontend/src/features/chat/dropbox-auth.ts`) with `token_access_type=offline`
   so a refresh token comes back.
3. `POST /login-source` exchanges the code and `login()` calls
   `users_get_current_account` once, for `account_id`, `email`, `team.id` and
   `root_info.root_namespace_id`.
4. The client is rebound with `with_path_root(PathRoot.root(root_namespace_id))`
   so paths resolve against the **team space** — the level the web UI calls *All
   files* — rather than the member's own folder. Without this, team folders are
   not addressable at all.
5. Credentials are stored in the `credentials` table, flagged `is_admin` when the
   connecting user holds the ASM2 `admin` role. That flag is about ASM2 roles and
   has nothing to do with Dropbox admin rights.

### Indexing

`run_vdb_update_once` in `backend/server.py` calls
`get_authenticated_admin_sources`, so indexing runs on the credentials of ASM2
admins. `list_files()` then:

1. `list_entries()` — one `files_list_folder(recursive=True)` per configured root,
   dropping folders, excluded subtrees and unsupported extensions.
2. `list_shared_links()` — **one** paginated pass over the account's shared links,
   keyed by file id.
3. `list_editor_names()` — the distinct last editors resolved in batches of 100
   through `users_get_account_batch`.
4. `get_file_principals()` per file — pure local work, since the shared folder id
   is already on the entry.

No permission request is made per file. A folder with 500 documents costs zero
extra calls.

### A user asks a question

1. `get_selected_authenticated_sources` builds a `DropboxSource` from that user's
   own stored credentials.
2. `get_authenticated_principals()` returns their identity, their team, and one
   `dropbox:folder:<id>` per accessible shared folder.
3. `get_permissions_filter()` turns that set into the Qdrant filter.
4. Retrieved chunks are re-checked with `has_access()`, a live
   `files_get_metadata` call as that same user.

---

## 4. Principals

Principals are the strings stored in `metadata.permissions.allowed` at index time
and matched against the querying user's set at query time.

| Principal | Meaning |
| --- | --- |
| `dropbox:folder:<shared_folder_id>` | anyone who can open that shared folder |
| `dropbox:user_id:<account_id>` | one account, by stable id |
| `dropbox:user:<email>` | one account, by lowercased email |
| `dropbox:team:<team_id>` | anyone in the team (Drive's `domain` analogue) |
| `dropbox:anyone` | a public shared link exists |

Two deliberate rules:

- **Folders with `traverse` or `no_access` are dropped** from a user's set. Those
  access levels expose the folder structure, not the content.
- **A file outside any shared folder falls back to the indexing account only** —
  its `user_id` and `user` principals, *never* `dropbox:team:<team_id>`. Every
  member carries the team principal, so using it as a fallback would publish a
  private file to the whole team. The connector under-shares instead.

---

## 5. Caching

Every HTTP request rebuilds its sources from stored credentials, so without
caching each chat message would re-run the account and folder lookups before
touching Qdrant.

| Cache | Key | TTL | Holds |
| --- | --- | --- | --- |
| `_ACCOUNT_CACHE` | SHA-256 of the access token | 5 min | account id, email, team id, namespace |
| `_FOLDERS_CACHE` | account id | 5 min | accessible folder principals |

Both are in-process; a multi-worker deployment warms each worker separately.
Being added to a shared folder takes up to 5 minutes to take effect for queries.
Documents moved into a *different* shared folder take effect at the next indexing
run.

A failed folder listing returns an empty set rather than a partial one, so a
transient API error under-shares for that request instead of answering from a
half-built list.

---

## 6. Creating The Dropbox App

Any Dropbox account can do this — a team admin is not needed at any step.

### 6.1 Create the app

1. Go to <https://www.dropbox.com/developers/apps> and click **Create app**.
2. Choose **Scoped access**.
3. Choose **Full Dropbox** — not *App folder*. App-folder apps get their own
   sandbox directory and can never see team or shared folders.
4. Name the app (for example `ASM2-app`) and create it.

### 6.2 Grant the scopes

Open the **Permissions** tab and tick exactly these four:

| Scope | Needed for |
| --- | --- |
| `account_info.read` | account id, email, team id, team space namespace |
| `files.metadata.read` | listing files and folders |
| `files.content.read` | downloading file contents to index |
| `sharing.read` | `sharing_list_folders` and shared link visibility |

Click **Submit**.

> **Do not tick anything under Team Scopes.** A single team scope converts the app
> to team-scoped, and Dropbox then refuses authorization from any account that is
> not a Dropbox Business team admin, with
> `oauth2/authorize_error?...&error_name=check_add_team_not_team_admin`. The
> connector uses no Team API endpoint, so no team scope is needed.

Scope changes do not affect tokens that already exist. After changing scopes,
disconnect and reconnect in the Sources panel.

### 6.3 Add the redirect URIs

On the **Settings** tab, under **OAuth 2 → Redirect URIs**, add one entry per
environment, all pointing at the frontend callback route:

```
http://localhost:3001/chat/provider-callback
https://your-domain.example/chat/provider-callback
```

`http` is only allowed for `localhost`. Leave **Allow public clients (Implicit
Grant & PKCE)** set to **Disallow** — the backend holds the app secret and does a
confidential code exchange.

### 6.4 Copy the credentials

Still on **Settings**, copy the **App key**, and click **Show** next to **App
secret**. Put both in `.env`:

```dotenv
DROPBOX_APP_KEY=your_app_key
DROPBOX_APP_SECRET=your_app_secret
```

### 6.5 Development versus production

A new app sits in **Development** status, which caps it at 50 linked user
accounts. That is plenty for a pilot. Click **Apply for production** before
rolling out more widely; the review has real lead time, so start it early.

Unlike a team-scoped app, a user-scoped app in development can be authorized by
any account that knows the link — no per-team enablement step.

---

## 7. Configuring The Roots

`DROPBOX_ROOTS` is a comma-separated list of **paths relative to the team space
root** — the level the Dropbox web UI shows as *All files*.

Given this in the web UI:

```
All files
├── Seguridad                      <- a team folder
└── Marcos Javier Magni Mattoni    <- a member folder
    └── Seguridad
```

- the team folder is `Seguridad`
- the folder inside the member folder is `Marcos Javier Magni Mattoni/Seguridad`

```dotenv
DROPBOX_ROOTS=Seguridad,Shared/Wiki
DROPBOX_EXCLUDE=Seguridad/Drafts
```

Leading and trailing slashes are optional. `DROPBOX_EXCLUDE` uses the same paths
and drops a folder and everything under it.

**Leaving `DROPBOX_ROOTS` empty indexes everything the indexing account can
reach**, including its own private files. Always set explicit roots in
production.

Paths, not ids, because the App Console and web UI never show a folder id. The
trade-off is that renaming a root folder in Dropbox silently stops indexing it —
check the indexing logs for `Failed to list Dropbox root` after any folder
reorganization.

---

## 8. Supported File Types

Dropbox returns no MIME type, so it is inferred from the extension by
`SUPPORTED_MIMES`. Anything not listed is skipped, which is the equivalent of
Drive's server-side MIME filter.

`.pdf` `.txt` `.md` `.markdown` `.html` `.htm` `.csv` `.docx` `.pptx` `.xlsx`

Dropbox Paper documents are not included: they are non-downloadable and the
listing requests `include_non_downloadable_files=False`.

---

## 9. Known Limitations

1. **Indexing coverage is whatever the indexing account can see.** Without a team
   admin there is no way to reach a team folder nobody has joined. Add the
   indexing account to every folder that should be searchable — a dedicated
   service account added to all of them is the cleanest arrangement.
2. **Each user must connect Dropbox themselves.** Resolving another person's
   access requires the Team API, so per-user OAuth is unavoidable here. It is also
   what the Google Drive connector already does.
3. **Shared links created by other members are invisible.**
   `sharing_list_shared_links` is scoped to the acting account, so a public link
   someone else created is not seen and the file is not marked `dropbox:anyone`.
   This under-shares, never over-shares.
4. **Files shared individually, outside any shared folder, reach only the indexer.**
   They have no `parent_shared_folder_id`, so there is no folder principal to
   grant. Put shared material in a shared folder.
5. **Exclusions do not prune traversal.** `files_list_folder` is recursive
   server-side, so excluded subtrees are still listed and then discarded. Correct,
   but it costs listing requests.
6. **No file owner.** Dropbox exposes no owner field, so the last editor
   (`sharing_info.modified_by`) stands in for Drive's `owners`. Files nobody else
   has touched are attributed to the indexing account.

---

## 10. Troubleshooting

**`error_name=check_add_team_not_team_admin` on the Dropbox authorize page.**
The app has at least one team scope, which makes it team-scoped and admin-only.
Untick every Team Scope in the App Console, Submit, then reconnect.

**"Dropbox login failed" in the logs.**
Usually a revoked token or a missing scope. Reconnect from the Sources panel; if
it persists, confirm the four scopes in §6.2 are granted and the app is **Full
Dropbox**, not App folder.

**The connection succeeds but no files are indexed.**
Check `DROPBOX_ROOTS`. Look for `Failed to list Dropbox root <name>` in the
indexing logs, which means the path does not resolve — usually a rename, or a
member-folder path missing its member-name prefix.

**A user sees no Dropbox documents.**
They have not connected Dropbox, or they have not selected it for chat retrieval
in the Sources panel. Both are per-user.

**A user sees fewer documents than they can see in Dropbox.**
They were probably added to a shared folder within the last five minutes; the
folder cache TTL applies. Otherwise the documents live in a folder the indexing
account cannot reach, so they were never indexed (limitation 1).

**Everything is slow on the first request after a restart.**
Expected. Both caches are in-process and empty after a restart, so the first
request per worker pays the account and folder lookups.
