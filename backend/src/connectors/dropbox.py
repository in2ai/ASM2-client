from datetime import datetime, timedelta
import json
import logging
import os
from typing import Any, List, Tuple
from urllib.parse import quote

import dropbox
import requests
from dropbox.exceptions import ApiError

from src.config.config import (
    DROPBOX_CLIENT_SECRET,
    DROPBOX_CLIENT_SECRET_FILE,
    DROPBOX_ROOTS,
    DROPBOX_EXCLUDE,
)
from src.connectors.source import DataSource
from src.connectors.vdb_file import DropboxFile
from src.utils.helpers import safe_call


TOKEN_URL = "https://api.dropboxapi.com/oauth2/token"

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


def guess_mime_from_name(name: str) -> str | None:
    _, extension = os.path.splitext((name or "").lower())

    return SUPPORTED_MIMES.get(extension)


def get_dropbox_client_config() -> dict[str, Any] | None:
    payloads = []

    if DROPBOX_CLIENT_SECRET:
        try:
            payloads.append(json.loads(DROPBOX_CLIENT_SECRET))
        except json.JSONDecodeError:
            pass

    if DROPBOX_CLIENT_SECRET_FILE and os.path.isfile(DROPBOX_CLIENT_SECRET_FILE):
        try:
            with open(DROPBOX_CLIENT_SECRET_FILE, "r", encoding="utf-8") as file:
                payloads.append(json.load(file))
        except (OSError, json.JSONDecodeError):
            pass

    for payload in payloads:
        app_key = payload.get("app_key") or payload.get("client_id")
        app_secret = payload.get("app_secret") or payload.get("client_secret")

        if app_key and app_secret:
            return {"app_key": app_key, "app_secret": app_secret}

    return None


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
        # Granted scopes, so the Team API can be skipped when it isn't reachable
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


class DropboxSource(DataSource):
    # Lowercase: this value is written to metadata.source and matched verbatim
    # by get_permissions_filter
    name = "dropbox"
    display_name = "Dropbox"


    def __init__(self, raw_creds: str):
        super().__init__(self.name, raw_creds, DROPBOX_ROOTS)

        self.credentials = None
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

            account = safe_call(self.service.users_get_current_account)
            self.account_name = account.name.display_name

            self.update_authenticated_principals()

            return True

        except Exception:
            self.service = None
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

            self.credentials = refreshed
            self.raw_creds = json.dumps(refreshed)
            self.service = build_dropbox_client(refreshed)

            return True

        except Exception:
            return False


    def expiry(self) -> Tuple[datetime, datetime]:
        raw_expiry = self.credentials.get("expiry")
        expiry = datetime.fromisoformat(raw_expiry) if raw_expiry else None
        needs_refresh_at = expiry - timedelta(minutes=20) if expiry is not None else None

        return needs_refresh_at, expiry


    def get_authenticated_principals(self) -> List[str]:
        result_tokens = set()
        account_id = None
        email = None
        team_id = None

        # 1) Basic identity via the current account endpoint
        try:
            account = safe_call(self.service.users_get_current_account)
            account_id = account.account_id
            email = account.email
            team_id = account.team.id if account.team else None

        except ApiError:
            pass

        if account_id:
            result_tokens.add(f"dropbox:user_id:{account_id}")

        if email:
            result_tokens.add(f"dropbox:user:{email.strip().lower()}")

        # Team is the closest analogue to Drive's domain principal
        if team_id:
            result_tokens.add(f"dropbox:team:{team_id}")

        # Fetch groups via the Team API (requires a team-scoped token)
        if account_id:
            result_tokens |= self.get_group_principals(account_id, team_id)

        return sorted(result_tokens)


    def get_group_principals(self, account_id: str, team_id: str | None) -> set:
        # No team or no groups.read means the Team API is unreachable, so don't
        # spend a request finding out. Legacy tokens report no scopes at all, so
        # those still get attempted.
        scopes = self.credentials.get("scopes") or []

        if not team_id or (scopes and "groups.read" not in scopes):
            return set()

        # Dropbox has no per-user group listing, so every team group gets walked
        tokens = set()

        try:
            team = dropbox.DropboxTeam(
                oauth2_access_token=self.credentials["access_token"],
                oauth2_refresh_token=self.credentials.get("refresh_token"),
                app_key=self.credentials.get("app_key"),
                app_secret=self.credentials.get("app_secret"),
            )

            groups = []
            resp = safe_call(team.team_groups_list, limit=100)

            while True:
                groups.extend(resp.groups)

                if not resp.has_more:
                    break

                resp = safe_call(team.team_groups_list_continue, resp.cursor)

            for group in groups:
                selector = dropbox.team.GroupSelector.group_id(group.group_id)
                members = safe_call(team.team_groups_members_list, selector, limit=100)

                while True:
                    if any(m.profile.account_id == account_id for m in members.members):
                        tokens.add(f"dropbox:group:{group.group_id}")
                        break

                    if not members.has_more:
                        break

                    members = safe_call(team.team_groups_members_list_continue, members.cursor)

        except Exception:
            # Personal accounts and user-scoped tokens can't reach the Team API
            logging.debug("Dropbox team groups unavailable", exc_info=True)

        return tokens


    def has_access(self, file_id: str) -> bool:
        try:
            safe_call(self.service.files_get_metadata, file_id)

            return True

        except ApiError:
            return False


    def get_file_principals(self, file_id: str):
        # List all members, including those inherited from parent shared folders
        users = []
        groups = []

        try:
            resp = safe_call(
                self.service.sharing_list_file_members,
                file=file_id,
                include_inherited=True,
                limit=100,
            )

            while True:
                users.extend(resp.users)
                groups.extend(resp.groups)

                if not resp.has_more:
                    break

                resp = safe_call(
                    self.service.sharing_list_file_members_continue, cursor=resp.cursor
                )

        except ApiError:
            # Files outside any shared folder have no member list at all, so the
            # indexing account is the only principal that can reach them
            return {"anyone": False, "allowed": list(self.authenticated_principals)}

        # Shared links are what reveal 'anyone with the link' and team-wide access
        try:
            links = safe_call(
                self.service.sharing_list_shared_links, path=file_id, direct_only=False
            ).links

        except ApiError:
            links = []

        return self._principals_from_members(users, groups, links)


    @staticmethod
    def _principals_from_members(users, groups, links):
        # Transform members and links to unified format
        acl_principals = set()
        acl_anyone = False

        for u in users:
            # traverse and no_access only expose the folder structure, not content
            if u.access_type.is_traverse() or u.access_type.is_no_access():
                continue

            acl_principals.add(f"dropbox:user_id:{u.user.account_id}")
            acl_principals.add(f"dropbox:user:{u.user.email.strip().lower()}")

        for g in groups:
            if g.access_type.is_traverse() or g.access_type.is_no_access():
                continue

            # group_id, not name: the only identifier team_groups_list also returns
            acl_principals.add(f"dropbox:group:{g.group.group_id}")

        for link in links:
            visibility = link.link_permissions.resolved_visibility

            if visibility is None:
                continue

            if visibility.is_public():
                acl_anyone = True
                acl_principals.add("dropbox:anyone")

            elif visibility.is_team_only() and link.content_owner_team_info:
                acl_principals.add(f"dropbox:team:{link.content_owner_team_info.id}")

        return {
            "anyone": acl_anyone,
            "allowed": sorted(acl_principals),
        }


    def list_files(self):
        # Discover all files. files_list_folder is recursive, so unlike Drive
        # there is no BFS to run; exclusions are applied here instead
        entries = []

        for raw_root in self.roots:
            root = "/" + raw_root.strip("/") if raw_root.strip("/") else ""

            try:
                resp = safe_call(
                    self.service.files_list_folder,
                    root,
                    recursive=True,
                    include_non_downloadable_files=False,
                )

                while True:
                    for e in resp.entries:
                        if not isinstance(e, dropbox.files.FileMetadata):
                            continue

                        if any(
                            e.path_lower == x or e.path_lower.startswith(x + "/")
                            for x in self.exclude
                        ):
                            continue

                        if guess_mime_from_name(e.name) is None:
                            continue

                        entries.append((root, e))

                    if not resp.has_more:
                        break

                    resp = safe_call(self.service.files_list_folder_continue, resp.cursor)

            except ApiError:
                logging.exception("Failed to list Dropbox root %s", raw_root)

        # Get metadata for each file
        res = []
        failed = 0
        display_names = {}

        for root, e in entries:
            try:
                # Dropbox exposes no file owner, so the last editor stands in for
                # Drive's owners; files nobody else has touched fall back to us
                editor = e.sharing_info.modified_by if e.sharing_info else None

                if editor and editor not in display_names:
                    account = safe_call(self.service.users_get_account, editor)
                    display_names[editor] = account.name.display_name

                author = display_names.get(editor) or self.account_name
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
                        # Two requests per file: Dropbox has no inline ACL field
                        "permissions": self.get_file_principals(e.id),
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