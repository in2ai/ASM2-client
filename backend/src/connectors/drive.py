from typing import List

from googleapiclient.errors import HttpError
from googleapiclient.discovery import build

from src.config.config import GDRIVE_ROOT
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


class GoogleDriveSource(DataSource):
    name = 'GDrive'


    def __init__(self, raw_creds: str):
        super().__init__(self.name, raw_creds, GDRIVE_ROOT)


    def login(self) -> bool:
        # TODO: store service and credentials somehow (waiting for global auth)
        self.service = None
        self.credentials = None

        self.update_authenticated_principals()


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

        return {
            "anyone": bool(acl_anyone),
            "allowed": sorted(acl_principals)
        }
        
        
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
                "permissions": self.get_file_principals(f["id"])
            } 
            for f in files
        ]

        # Transform to file model
        files = [GoogleDriveFile(f, self.service) for f in files]

        return files