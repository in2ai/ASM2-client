from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
import json
import logging
import os
import time
from typing import Any
from urllib.parse import quote

import dropbox
import requests
from dropbox.exceptions import DropboxException

from src.config.config import (
    DROPBOX_APP_KEY,
    DROPBOX_APP_SECRET,
    DROPBOX_ROOTS,
    DROPBOX_EXCLUDE,
)
from src.connectors.source import DataSource
from src.connectors.vdb_file import DropboxFile
from src.utils.helpers import safe_call


TOKEN_URL = "https://api.dropboxapi.com/oauth2/token"

# users_get_account_batch has no documented cap, so keep the batches modest
ACCOUNT_BATCH_SIZE = 100

# Every request rebuilds its sources from stored credentials, so without these
# each chat message would re-run the account and shared folder lookups before it
# reaches Qdrant.
_CACHE_TTL_SECONDS = 300
_ACCOUNT_CACHE: dict[str, tuple[float, "MemberContext"]] = {}
_FOLDERS_CACHE: dict[str, tuple[float, tuple[str, ...]]] = {}

# Dropbox returns no MIME type, so it is inferred from the extension. Anything
# not listed is skipped, the equivalent of Drive's server-side MIME filter.
SUPPORTED_MIMES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@dataclass(frozen=True)
class SharedLinkIndex:
    """The account's shared links, in the two shapes a file lookup needs.

    Dropbox grants a folder link to every file below it, and those files carry
    ids of their own, so a folder link can only be matched to a file by path.
    """

    # Links whose target is the file itself, keyed by the linked file id
    by_file_id: dict[str, list]
    # Folder links as (folder path_lower, link), longest path first so the
    # closest folder link to a file is the one reported for it
    folder_links: tuple[tuple[str, Any], ...]

    def for_file(self, entry) -> list[tuple[Any, str | None]]:
        """Every link that grants this file, with the path each addresses it by.

        The path is None for a direct file link, and the file's path relative to
        the shared folder for a folder link - what get_shared_link_metadata's
        `path` argument expects.
        """
        matches = [(link, None) for link in self.by_file_id.get(entry.id, [])]
        path = (getattr(entry, "path_lower", None) or "").lower()

        if not path:
            return matches

        for folder_path, link in self.folder_links:
            if path.startswith(folder_path + "/"):
                matches.append((link, path[len(folder_path):]))

        return matches


@dataclass(frozen=True)
class MemberContext:
    """Who the token belongs to, and where its paths resolve."""

    account_id: str
    email: str
    display_name: str
    # None for a personal account: there is simply no team principal to grant
    team_id: str | None
    # Team space namespace. Without it every path resolves inside the member's
    # own folder and team folders are not addressable at all.
    root_namespace_id: str | None


def guess_mime_from_name(name: str) -> str | None:
    _, extension = os.path.splitext((name or "").lower())

    return SUPPORTED_MIMES.get(extension)


def link_audience_team_id(link) -> str | None:
    """The team a team_only link admits: the link owner's, not the content's.

    Dropbox only sets content_owner_team_info when the content owner's team
    differs from the link owner's, so reading it names the wrong team in exactly
    the cross-team case it exists for. team_member_info describes the link owner,
    whose team is the audience. Neither present means the audience cannot be
    established, and an unattributable link grants nothing.
    """
    member_info = getattr(link, "team_member_info", None)
    team_info = getattr(member_info, "team_info", None)

    return getattr(team_info, "id", None)


def get_dropbox_client_config() -> dict[str, Any] | None:
    # Unlike Google, Dropbox hands out the key and secret as two plain strings
    # in the App Console, so there is no JSON payload to parse.
    if not DROPBOX_APP_KEY or not DROPBOX_APP_SECRET:
        return None

    return {"app_key": DROPBOX_APP_KEY, "app_secret": DROPBOX_APP_SECRET}


def get_dropbox_oauth_client_id() -> str | None:
    client_config = get_dropbox_client_config()

    return client_config["app_key"] if client_config else None


def request_dropbox_token(**params) -> dict[str, Any] | None:
    # Code exchange and refresh hit the same endpoint, only the grant differs.
    # DropboxOAuth2Flow needs a CSRF/session dance and the NoRedirect variant
    # never sends redirect_uri, so neither fits a backend handed a bare code.
    client_config = get_dropbox_client_config()

    if not client_config:
        return None

    response = requests.post(
        TOKEN_URL,
        data={
            **params,
            "client_id": client_config["app_key"],
            "client_secret": client_config["app_secret"],
        },
        timeout=30,
    )

    if response.status_code != 200:
        logging.warning(
            "Dropbox token request failed (%s): %s", response.status_code, response.text[:300]
        )

        return None

    payload = response.json()
    expires_in = payload.get("expires_in")

    return {
        "access_token": payload["access_token"],
        "refresh_token": payload.get("refresh_token"),
        # Naive UTC, matching what google.oauth2 puts on Credentials.expiry
        "expiry": (
            (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()
            if expires_in
            else None
        ),
        "app_key": client_config["app_key"],
        "app_secret": client_config["app_secret"],
        "scopes": payload.get("scope", "").split(),
    }


def build_dropbox_client(credentials: dict[str, Any]) -> dropbox.Dropbox:
    expiry = credentials.get("expiry")

    return dropbox.Dropbox(
        oauth2_access_token=credentials["access_token"],
        oauth2_refresh_token=credentials.get("refresh_token"),
        oauth2_access_token_expiration=datetime.fromisoformat(expiry) if expiry else None,
        app_key=credentials.get("app_key"),
        app_secret=credentials.get("app_secret"),
        timeout=100,
    )


def get_member_context(client: dropbox.Dropbox, access_token: str) -> MemberContext:
    cache_key = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
    now = time.time()
    cached = _ACCOUNT_CACHE.get(cache_key)

    if cached and now < cached[0]:
        return cached[1]

    account = safe_call(client.users_get_current_account)
    root_info = getattr(account, "root_info", None)

    context = MemberContext(
        account_id=account.account_id,
        email=account.email,
        display_name=account.name.display_name,
        team_id=account.team.id if account.team else None,
        root_namespace_id=root_info.root_namespace_id if root_info else None,
    )

    _ACCOUNT_CACHE[cache_key] = (now + _CACHE_TTL_SECONDS, context)

    return context


def get_accessible_folder_ids(client: dropbox.Dropbox, account_id: str) -> tuple[str, ...]:
    """Every shared folder this token can actually read, as principals.

    This is the whole permission model. Dropbox decides effective access itself,
    so individual grants, group grants, team folder membership and nested
    inheritance all collapse into "is this folder in my list?" - which is why the
    connector needs no Team API and no Dropbox admin.
    """
    now = time.time()
    cached = _FOLDERS_CACHE.get(account_id)

    if cached and now < cached[0]:
        return cached[1]

    principals = set()

    try:
        resp = safe_call(client.sharing_list_folders, limit=100)

        while True:
            for folder in resp.entries:
                access_type = folder.access_type

                # traverse and no_access only expose the folder structure
                if access_type and (access_type.is_traverse() or access_type.is_no_access()):
                    continue

                principals.add(f"dropbox:folder:{folder.shared_folder_id}")

            cursor = getattr(resp, "cursor", None)

            if not cursor:
                break

            resp = safe_call(client.sharing_list_folders_continue, cursor)

    # DropboxException, not ApiError: safe_call re-raises the RateLimitError or
    # InternalServerError it gave up on, and those are HttpError subclasses. Only
    # the common base keeps an exhausted retry from escaping the fail-closed path.
    except DropboxException:
        # Better to under-share than to answer from a half-built list
        logging.warning("Dropbox shared folder listing failed", exc_info=True)

        return ()

    result = tuple(sorted(principals))
    _FOLDERS_CACHE[account_id] = (now + _CACHE_TTL_SECONDS, result)

    return result


class DropboxSource(DataSource):
    # Lowercase: this value is written to metadata.source and matched verbatim
    # by get_permissions_filter
    name = "dropbox"
    display_name = "Dropbox"


    def __init__(self, raw_creds: str):
        super().__init__(self.name, raw_creds, DROPBOX_ROOTS)

        self.credentials = None
        self.context = None
        self.service = None
        self.account_name = None
        self.exclude = {"/" + p.strip("/").lower() for p in DROPBOX_EXCLUDE if p.strip("/")}


    def login_info() -> dict[str, Any] | None:
        oauth_client_id = get_dropbox_oauth_client_id()
        if not oauth_client_id:
            return None

        return {
            "auth_mode": "authorization_code",
            "oauth_client_id": oauth_client_id,
        }


    def login(self) -> bool:
        try:
            creds_dict = json.loads(self.raw_creds)

            # First login
            if creds_dict.get('auth_token') and creds_dict.get('redirect_uri'):
                creds_dict = request_dropbox_token(
                    grant_type="authorization_code",
                    code=creds_dict['auth_token'],
                    redirect_uri=creds_dict['redirect_uri'],
                )

                if creds_dict is None:
                    raise RuntimeError("Dropbox OAuth code exchange failed")

                self.raw_creds = json.dumps(creds_dict)

            self.credentials = creds_dict
            self.service = build_dropbox_client(creds_dict)
            self.context = get_member_context(self.service, creds_dict["access_token"])
            self.account_name = self.context.display_name

            # Resolve paths against the team space rather than this member's own
            # folder, so team folders are addressable by their plain name
            if self.context.root_namespace_id:
                self.service = self.service.with_path_root(
                    dropbox.common.PathRoot.root(self.context.root_namespace_id)
                )

            self.update_authenticated_principals()

            return True

        except Exception:
            self.service = None
            self.context = None
            self.credentials = None
            logging.warning("Dropbox login failed", exc_info=True)

            return False


    def refresh(self) -> bool:
        if self.credentials is None or not self.credentials.get("refresh_token"):
            return False

        try:
            refreshed = request_dropbox_token(
                grant_type="refresh_token",
                refresh_token=self.credentials["refresh_token"],
            )

            if refreshed is None:
                return False

            # The refresh response doesn't repeat these
            refreshed["refresh_token"] = self.credentials["refresh_token"]
            refreshed["scopes"] = refreshed["scopes"] or self.credentials.get("scopes", [])

            self.raw_creds = json.dumps(refreshed)

            # Rebuilds the client against the new token
            return self.login()

        except Exception:
            return False


    def expiry(self) -> tuple[datetime, datetime]:
        raw_expiry = self.credentials.get("expiry")
        expiry = datetime.fromisoformat(raw_expiry) if raw_expiry else None
        needs_refresh_at = expiry - timedelta(minutes=20) if expiry is not None else None

        return needs_refresh_at, expiry


    def identity_principals(self) -> list[str]:
        # Everything that identifies the account itself, with no folder access
        # implied. Also the fallback ACL for a file nobody else can reach.
        return [
            f"dropbox:user_id:{self.context.account_id}",
            f"dropbox:user:{self.context.email.strip().lower()}",
        ]


    def get_authenticated_principals(self) -> list[str]:
        if self.context is None:
            return []

        principals = set(self.identity_principals())

        # Team is the closest analogue to Drive's domain principal
        if self.context.team_id:
            principals.add(f"dropbox:team:{self.context.team_id}")

        principals.update(get_accessible_folder_ids(self.service, self.context.account_id))

        return sorted(principals)


    def has_access(self, file_id: str, metadata: dict[str, Any] | None = None) -> bool:
        try:
            safe_call(self.service.files_get_metadata, file_id)

            return True

        except DropboxException:
            # A file id only resolves inside the caller's own namespace, so this
            # fails for someone whose entitlement is a shared link rather than
            # folder membership. The link is the only handle they have on the
            # file, and it is the recorded justification for dropbox:anyone and
            # for a link-derived dropbox:team, so re-check it before giving up.
            permissions = (metadata or {}).get("permissions") or {}
            link = permissions.get("link")

            if not link:
                return False

            return self.has_link_access(file_id, link, permissions.get("link_path"))


    def has_link_access(self, file_id: str, url: str, path: str | None = None) -> bool:
        # Dropbox resolves the link's audience itself: a revoked link, or one
        # narrowed to a team this caller is not in, comes back access_denied.
        # `path` walks a folder link down to the file, which is the only way to
        # address a file that a folder link, rather than its own link, grants.
        try:
            link_metadata = safe_call(
                self.service.sharing_get_shared_link_metadata, url, path=path
            )

        except DropboxException:
            return False

        # A link points at a path, and a path can end up holding a different
        # file than the one indexed. Only the recorded file is granted, and an
        # id-less response is treated as a mismatch rather than trusted.
        return getattr(link_metadata, "id", None) == file_id


    def get_file_principals(self, entry, links: SharedLinkIndex) -> dict[str, Any]:
        # Dropbox ACLs live on the shared folder, never on the file, and the
        # folder id is already in the listing response. Naming the folder instead
        # of expanding its members keeps indexing free of permission requests and
        # lets each user match it against their own accessible folders.
        folder_id = (
            getattr(entry.sharing_info, "parent_shared_folder_id", None)
            if entry.sharing_info
            else None
        )
        principals = (
            {f"dropbox:folder:{folder_id}"} if folder_id else set(self.identity_principals())
        )
        anyone = False
        # The link the widened principals rest on, as the url plus the path that
        # addresses this file through it. has_access needs both to verify
        # link-only access at query time, and the url doubles as the citation
        # link, since the path url only opens for someone with folder access.
        # for_file yields the file's own links before folder ones and the
        # innermost folder first, so the first url of each kind is the shortest
        # way to the file and the one worth recording.
        public_link = (None, None)
        team_link = (None, None)

        # Shared links are what reveal 'anyone with the link' and team-wide access
        for link, link_path in links.for_file(entry):
            visibility = link.link_permissions.resolved_visibility

            if visibility is None:
                continue

            if visibility.is_public():
                anyone = True
                principals.add("dropbox:anyone")

                if public_link[0] is None and getattr(link, "url", None):
                    public_link = (link.url, link_path)

            elif visibility.is_team_only():
                team_id = link_audience_team_id(link)

                if team_id:
                    principals.add(f"dropbox:team:{team_id}")

                    if team_link[0] is None and getattr(link, "url", None):
                        team_link = (link.url, link_path)

        # A public link admits every caller a team link would, so recording one
        # is enough.
        url, path = public_link if public_link[0] else team_link

        return {
            "anyone": anyone,
            "allowed": sorted(principals),
            # Both keys are always present, even as None: store.py refreshes
            # metadata.permissions rather than replacing it, and a missing key
            # would keep a revoked link alive in Qdrant.
            "link": url,
            # None for a link on the file itself; the file's path inside the
            # shared folder for a folder link
            "link_path": path,
        }


    def list_shared_links(self) -> SharedLinkIndex:
        # One paginated pass over the account's links rather than a
        # sharing_list_shared_links call per file. Links created by other members
        # are invisible here, so an unseen public link under-shares.
        by_file_id = {}
        folder_links = []
        cursor = None

        try:
            while True:
                resp = safe_call(self.service.sharing_list_shared_links, cursor=cursor)

                for link in resp.links:
                    if isinstance(link, dropbox.sharing.FolderLinkMetadata):
                        # path_lower is absent for a folder outside this account's
                        # own Dropbox, and there is nothing to match such a link
                        # against, so it is dropped rather than guessed at.
                        folder_path = (getattr(link, "path_lower", None) or "").rstrip("/")

                        if folder_path:
                            folder_links.append((folder_path, link))

                        continue

                    file_id = getattr(link, "id", None)

                    if file_id:
                        by_file_id.setdefault(file_id, []).append(link)

                if not resp.has_more:
                    break

                cursor = resp.cursor

        except DropboxException:
            logging.warning("Dropbox shared link listing failed", exc_info=True)

        # Deepest first, so the innermost folder link wins the recorded url
        folder_links.sort(key=lambda pair: len(pair[0]), reverse=True)

        return SharedLinkIndex(by_file_id, tuple(folder_links))


    def list_editor_names(self, account_ids) -> dict[str, str]:
        # Dropbox exposes no file owner, so the last editor stands in for Drive's
        # owners. Batched, because a big folder has few editors but many files.
        names = {}
        pending = sorted(account_ids)

        for start in range(0, len(pending), ACCOUNT_BATCH_SIZE):
            batch = pending[start:start + ACCOUNT_BATCH_SIZE]

            try:
                for account in safe_call(self.service.users_get_account_batch, batch):
                    names[account.account_id] = account.name.display_name

            except DropboxException:
                logging.warning("Dropbox account lookup failed", exc_info=True)

        return names


    def is_indexable(self, entry) -> bool:
        if not isinstance(entry, dropbox.files.FileMetadata):
            return False

        if any(
            entry.path_lower == x or entry.path_lower.startswith(x + "/")
            for x in self.exclude
        ):
            return False

        return guess_mime_from_name(entry.name) is not None


    def list_entries(self):
        # files_list_folder is recursive server-side, so unlike Drive there is no
        # BFS to run; exclusions are applied to the flat result instead. Paths
        # are relative to the team space, so "" walks everything reachable —
        # which only the explicit "/" root asks for. Unset roots index nothing,
        # so a missing config cannot quietly pull in every private file.
        if not self.roots:
            logging.warning(
                "DROPBOX_ROOTS is empty, so no Dropbox file will be indexed. "
                "Set it to the folder paths to index, or to / for the whole team space."
            )

            return []

        entries = []

        for raw_root in sorted(self.roots):
            root = "/" + raw_root.strip("/") if raw_root.strip("/") else ""

            try:
                resp = safe_call(
                    self.service.files_list_folder,
                    root,
                    recursive=True,
                    include_non_downloadable_files=False,
                )

                while True:
                    entries.extend(
                        (root, e) for e in resp.entries if self.is_indexable(e)
                    )

                    if not resp.has_more:
                        break

                    resp = safe_call(self.service.files_list_folder_continue, resp.cursor)

            except DropboxException:
                logging.exception("Failed to list Dropbox root %s", raw_root)

        return entries


    def list_files(self):
        # Discover all files
        entries = self.list_entries()

        # Both are one request set for the whole run, not one per file
        links = self.list_shared_links()
        editor_names = self.list_editor_names(
            {
                e.sharing_info.modified_by
                for _, e in entries
                if e.sharing_info and e.sharing_info.modified_by
            }
        )

        # Get metadata for each file
        res = []
        failed = 0

        for root, e in entries:
            try:
                editor = e.sharing_info.modified_by if e.sharing_info else None
                author = editor_names.get(editor) or self.account_name
                parent = e.path_display.rsplit("/", 1)[0]

                res.append(
                    {
                        # Addressed by id everywhere, like Drive: paths move, ids don't
                        "id": e.id,
                        "name": e.name,
                        "path": e.path_display[len(root):].strip("/"),
                        "authors": [author] if author else [],
                        "mimeType": guess_mime_from_name(e.name),
                        # server_modified, since client_modified is device-reported
                        "modifiedTime": e.server_modified.isoformat(),
                        # No webViewLink equivalent; this is the URL Dropbox's own
                        # web UI uses, so it works for anyone who can open the file
                        "webViewLink": (
                            f"https://www.dropbox.com/home{quote(parent)}"
                            f"?preview={quote(e.name)}"
                        ),
                        "permissions": self.get_file_principals(e, links),
                    }
                )

            except Exception as ex:
                failed += 1
                logging.exception("Failed to process file %s: %s", e.id, ex)

        if failed:
            logging.warning(
                "Dropbox listing skipped %d of %d files due to processing errors",
                failed,
                len(entries),
            )

        # Transform to file model
        res = [DropboxFile(f, self.service) for f in res]

        return res
