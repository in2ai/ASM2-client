import dropbox
from dropbox.exceptions import ApiError

from src.config.config import DROPBOX_ROOT
from src.connectors.source import DataSource
from src.connectors.vdb_file import DropboxFile


def guess_mime_from_name(name: str) -> str:
    n = (name or "").lower()
    if n.endswith(".pdf"):
        return "application/pdf"
    if n.endswith(".md"):
        return "text/markdown"
    if n.endswith(".txt"):
        return "text/plain"
    if n.endswith(".html"):
        return "text/html"
    if n.endswith(".csv"):
        return "text/csv"
    if n.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if n.endswith(".pptx"):
        return (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
    if n.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return "application/octet-stream"


class DropboxSource(DataSource):
    def __init__(self):
        super().__init__('Dropbox', DROPBOX_ROOT)

    
    def login(self):
        # TODO: store service somehow (waiting for global auth)
        self.service = None

        self.update_authenticated_principals()

    
    def get_authenticated_principals(self):
        acct = self.service.users_get_current_account()

        tokens = set()

        account_id = acct.account_id
        email = acct.email
        team_id = acct.team.id if acct.team else None

        # canonical identifiers
        if account_id:
            tokens.add(f"dropbox:user_id:{account_id}")

        if email:
            tokens.add(f"dropbox:user:{email.strip().lower()}")

        if team_id:
            tokens.add(f"dropbox:team:{team_id}")

        return sorted(tokens)
    

    def has_access(self, file_id):
        try:
            self.service.files_get_metadata(file_id)
            return True
        
        except ApiError:
            return False
        
    
    def get_file_link(self, file_id: str):
        try:
            # Primero, intentar obtener enlaces compartidos existentes
            links = self.service.sharing_list_shared_links(path=file_id, direct_only=True)

            if links.links:
                return links.links[0].url

            # Si no existe ningún enlace, crear uno
            shared_link = self.service.sharing_create_shared_link_with_settings(file_id)

            return shared_link.url
        
        except ApiError as e:
            if (
                hasattr(e.error, "is_shared_link_already_exists")
                and e.error.is_shared_link_already_exists()
            ):
                links = self.service.sharing_list_shared_links(path=file_id, direct_only=True)
              
                if links.links:
                    return links.links[0].url
            
            return None
    
    def get_file_principals(self, file_id: str):
        principals = set()
        acl_anyone = False

        try:
            res = self.service.sharing_list_file_members(
                file=file_id,
                include_inherited=True,
                limit=100,
            )

        except ApiError:
            raise

        def process_page(page):
            # page.users is a list of UserFileMembershipInfo objects
            for u in getattr(page, "users", []) or []:
                # safe access to nested user object
                member = getattr(u, "user", None) or {}
                acct_id = getattr(member, "account_id", None)
                email = getattr(member, "email", None)

                if acct_id:
                    principals.add(f"dropbox:user_id:{acct_id}")
                if email:
                    principals.add(f"dropbox:user:{email.strip().lower()}")

        process_page(res)

        # follow pagination if needed
        has_more = getattr(res, "has_more", False)
        cursor = getattr(res, "cursor", None)

        while has_more:
            cont = self.service.sharing_list_file_members_continue(cursor=cursor)
            process_page(cont)
            has_more = getattr(cont, "has_more", False)
            cursor = getattr(cont, "cursor", None)

        # Check shared links to detect 'anyone with link' / public link
        try:
            links_res = self.service.sharing_list_shared_links(path=file_id)

        except ApiError:
            links_res = None

        if links_res:
            links = getattr(links_res, "links", []) or []

            for link in links:
                vis = None
                lp = getattr(link, "link_permissions", None)

                if lp is not None:
                    vis = getattr(lp, "resolved_visibility", None)
                
                if vis and vis.is_public():
                    acl_anyone = True
                    principals.add("dropbox:anyone")
                    break

                if vis and vis.is_team_only():
                    cot = getattr(link, "content_owner_team_info", None)

                    if cot and getattr(cot, "id", None):
                        team_id = cot.id
                        
                    else:
                        tmi = getattr(link, "team_member_info", None)
                        team_id = (getattr(tmi, "team_info", None) and getattr(tmi.team_info, "id", None)) or None

                    if team_id:
                        principals.add(f"dropbox:team:{team_id}")
        
        return {
            "anyone": bool(acl_anyone),
            "allowed": sorted(principals)
        }
    
    
    def list_files(self):
        # Discover all files
        if self.root and not self.root.startswith("/"):
            self.root = "/" + self.root

        files = []

        try:
            res = self.service.files_list_folder(
                self.root, recursive=True, include_non_downloadable_files=False
            )

            while True:
                for e in res.entries:
                    if isinstance(e, dropbox.files.FileMetadata):
                        files.append(e)

                if res.has_more:
                    res = self.service.files_list_folder_continue(res.cursor)

                else:
                    break

        except ApiError as e:
            pass

        # Discover all files
        files = [
            {
                "id": f.id,
                "name": f.name,
                "path_lower": f.path_lower,
                "modifiedTime": f.client_modified.isoformat(),
                "mimeType": guess_mime_from_name(f.name),
                "webViewLink": self.get_file_link(f.path_lower),
                "permissions": self.get_file_principals(f.id or f.path_lower)
            } 
            for f in files
        ]

        # Transform to file model
        files = [DropboxFile(f, self.service) for f in files]

        return files