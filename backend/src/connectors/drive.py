from datetime import datetime, timedelta
import json
import logging
import os
from typing import Any, List, Tuple

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import Flow

from src.config.config import (
    CLIENT_SECRET,
    CLIENT_SECRET_FILE,
    CLIENT_SECRET_WEBSITE,
    CLIENT_SECRET_WEBSITE_FILE,
    GDRIVE_ROOT,
    SCOPES,
)
from src.connectors.source import DataSource
from src.connectors.vdb_file import GoogleDriveFile
from src.utils.helpers import safe_execute


SUPPORTED_MIMES = (
    "application/pdf",
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)


def _extract_drive_client_config(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None

    for client_type in ("web", "installed"):
        client_config = payload.get(client_type)
        if not isinstance(client_config, dict):
            continue
        if client_config.get("client_id") and client_config.get("client_secret"):
            return {client_type: client_config}

    return None


def _load_drive_client_config_from_json(raw_payload: str | None) -> dict[str, Any] | None:
    if not raw_payload:
        return None

    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        return None

    return _extract_drive_client_config(payload)


def _load_drive_client_config_from_file(path: str | None) -> dict[str, Any] | None:
    if not path or not os.path.isfile(path):
        return None

    try:
        with open(path, "r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None

    return _extract_drive_client_config(payload)


def get_drive_client_config() -> dict[str, Any] | None:
    return (
        _load_drive_client_config_from_json(CLIENT_SECRET_WEBSITE)
        or _load_drive_client_config_from_json(CLIENT_SECRET)
        or _load_drive_client_config_from_file(CLIENT_SECRET_WEBSITE_FILE)
        or _load_drive_client_config_from_file(CLIENT_SECRET_FILE)
        or _load_drive_client_config_from_file("client_secret_website.json")
        or _load_drive_client_config_from_file("client_secret.json")
    )


def build_drive_flow(redirect_uri: str) -> Flow:
    client_config = get_drive_client_config()
    
    if not client_config:
        return None
    
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = redirect_uri

    return flow


def serialize_drive_credentials(credentials):
    return json.dumps(
        {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": list(getattr(credentials, "scopes", []) or SCOPES),
        }
    )


def get_drive_oauth_client_id() -> str | None:
    client_config = get_drive_client_config()
    if not client_config:
        return None

    config = next(iter(client_config.values()), None)
    if not isinstance(config, dict):
        return None

    client_id = config.get("client_id")
    return client_id if isinstance(client_id, str) and client_id else None


class GoogleDriveSource(DataSource):
    name = "drive"
    display_name = "Google Drive"

    @classmethod
    def login_info(cls) -> dict[str, Any] | None:
        oauth_client_id = get_drive_oauth_client_id()
        if not oauth_client_id:
            return None

        return {
            "auth_mode": "authorization_code",
            "oauth_client_id": oauth_client_id,
        }

    @classmethod
    def from_authorization_code(
        cls,
        authorization_code: str,
        redirect_uri: str,
    ) -> "GoogleDriveSource":
        flow = build_drive_flow(redirect_uri)
        if flow is None:
            raise RuntimeError("Google Drive OAuth client configuration is unavailable")

        flow.fetch_token(code=authorization_code)
        return cls(serialize_drive_credentials(flow.credentials))


    def __init__(self, raw_creds: str):
        super().__init__(self.name, raw_creds, GDRIVE_ROOT)


    def login(self) -> bool:
        try:
            creds_dict = json.loads(self.raw_creds)
        except (TypeError, json.JSONDecodeError):
            creds_dict = None

        try:
            if not isinstance(creds_dict, dict):
                return False

            self.credentials = Credentials.from_authorized_user_info(creds_dict)
            self.service = build("drive", "v3", credentials=self.credentials)

            self.update_authenticated_principals()

            return True
        
        except Exception:
            self.service = None
            self.credentials = None
            logging.warning("Google Drive login failed", exc_info=True)

            return False
        

    def refresh(self) -> bool:
        if self.credentials is None or not self.credentials.refresh_token:
            return False

        try:
            self.credentials.refresh(Request())
            self.raw_creds = serialize_drive_credentials(self.credentials)

            return True

        except Exception:
            return False
        

    def expiry(self) -> Tuple[datetime, datetime]:
        expiry = self.credentials.expiry
        needs_refresh_at = expiry - timedelta(minutes=20) if expiry is not None else None

        return needs_refresh_at, expiry


    def get_authenticated_principals(self) -> List[str]:
        result_tokens = set()
        email = None
        domain = None

        # 1) Basic identity via Drive 'about' endpoint
        try:
            about = self.service.about().get(fields="user(emailAddress,displayName,permissionId)").execute()
            user = about.get("user", {}) or {}
            email = user.get("emailAddress")

        except HttpError:
            about = {}
            email = None

        # Normalize and add tokens
        if email:
            email_norm = email.strip().lower()
            result_tokens.add(f"gdrive:user:{email_norm}")

            if "@" in email_norm:
                domain = email_norm.split("@", 1)[1]
                result_tokens.add(f"gdrive:domain:{domain}")

        # Fetch groups via Admin SDK Directory API (requires domain admin access)
        if self.credentials is None:
            pass

        else:
            if email:
                try:
                    admin_svc = build("admin", "directory_v1", credentials=self.credentials)
                    page_token = None

                    while True:
                        resp = admin_svc.groups().list(userKey=email, maxResults=100, pageToken=page_token).execute()
                        for g in resp.get("groups", []):
                            # group object usually has 'email' and 'id'
                            g_email = g.get("email")
                            g_id = g.get("id")
                            if g_email:
                                result_tokens.add(f"gdrive:group:{g_email.strip().lower()}")
                            elif g_id:
                                result_tokens.add(f"gdrive:group:{g_id}")

                        page_token = resp.get("nextPageToken")

                        if not page_token:
                            break
                except HttpError:
                    pass

        return sorted(result_tokens)


    def has_access(self, file_id: str) -> bool:
        try:
            safe_execute(
                self.service.files().get(fileId=file_id, fields="id", supportsAllDrives=True)
            )

            return True
        except HttpError:
            return False


    def get_file_principals(self, file_id: str):
        # List all file permissions
        permissions = []
        page_token = None

        FIELDS = (
            "nextPageToken,permissions("
            "id,type,role,emailAddress,domain,displayName,allowFileDiscovery"
            ")"
        )

        while True:
            resp = safe_execute(
                self.service.permissions()
                .list(
                    fileId=file_id,
                    pageSize=100,
                    pageToken=page_token,
                    fields=FIELDS,
                    supportsAllDrives=True,
                )
            )

            batch = resp.get("permissions", [])
            permissions.extend(batch)

            page_token = resp.get("nextPageToken")

            if not page_token:
                break

        # Transform permissions to unified format
        read_roles_set = {"reader", "commenter", "writer", "owner", "organizer"}
        acl_principals = set()
        acl_anyone = False

        for p in permissions:
            p_type = p.get("type")
            p_role = (p.get("role") or "").lower()

            if p_role not in read_roles_set:
                continue

            if p_type == "user":
                email = p.get("emailAddress")
                if email:
                    acct = email.strip().lower()
                    acl_principals.add(f"gdrive:user:{acct}")
            
            elif p_type == "group":
                group_email = p.get("emailAddress")
                if group_email:
                    acl_principals.add(f"gdrive:group:{group_email.strip().lower()}")
                else:
                    gid = p.get("id")
                    if gid:
                        acl_principals.add(f"gdrive:group:{gid}")
            
            elif p_type == "domain":
                domain = p.get("domain")
                if domain:
                    acl_principals.add(f"gdrive:domain:{domain.strip().lower()}")

            elif p_type == "anyone":
                acl_anyone = True
                acl_principals.add("gdrive:anyone")

        return {"anyone": bool(acl_anyone), "allowed": sorted(acl_principals)}


    def list_files(self):
        # Discover all files via BFS
        queue = [self.root]
        files = []

        while queue:
            current = queue.pop(0)
            page_token = None
            while True:
                resp = safe_execute(
                    self.service.files().list(
                        q=f"'{current}' in parents and trashed=false",
                        fields="nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink)",
                        pageSize=1000,
                        pageToken=page_token,
                        includeItemsFromAllDrives=True,
                        supportsAllDrives=True,
                    )
                )

                for f in resp.get("files", []):
                    if f["mimeType"] == "application/vnd.google-apps.folder":
                        queue.append(f["id"])
                    else:
                        files.append(f)

                page_token = resp.get("nextPageToken")

                if not page_token:
                    break

        # Filter by mime type
        files = [
            f
            for f in files
            if f["mimeType"] in SUPPORTED_MIMES
        ]

        # Get metadata for each file
        files = [
            {
                "id": f["id"],
                "name": f["name"],
                "mimeType": f["mimeType"],
                "modifiedTime": f["modifiedTime"],
                "webViewLink": f.get("webViewLink"),
                "permissions": self.get_file_principals(f["id"]),
            }
            for f in files
        ]

        # Transform to file model
        files = [GoogleDriveFile(f, self.service) for f in files]

        return files
