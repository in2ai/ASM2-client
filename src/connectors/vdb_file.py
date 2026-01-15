import io
from PyPDF2 import PdfReader
import requests
from src.config.config import GRAPH
from src.utils.helpers import safe_execute
from dropbox.exceptions import ApiError


class VDBFile:
    def __init__(self, metadata):
        self.metadata = metadata

    def get_text(self) -> str:
        ...


class GoogleDriveFile(VDBFile):
    def __init__(self, metadata, service):
        super().__init__(metadata)
        self.service = service

    def get_text(self) -> str:
        file_id = self.metadata['id']
        mime_type = self.metadata['mimeType']
        
        if mime_type == "application/pdf":
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            fh = io.BytesIO(data)
            reader = PdfReader(fh)
            return "\n".join([(p.extract_text() or "") for p in reader.pages]).strip()
        
        elif mime_type == "application/vnd.google-apps.document":
            data = safe_execute(self.service.files().export(fileId=file_id, mimeType="text/plain"))
            return data.decode("utf-8", errors="ignore")
        
        elif mime_type in ("text/plain", "text/markdown"):
            data = safe_execute(self.service.files().get_media(fileId=file_id))
            return data.decode("utf-8", errors="ignore")
        
        return None


class DropboxFile(VDBFile):
    def __init__(self, metadata, service):
        super().__init__(metadata)
        self.service = service

    def get_text(self) -> str:
        file_id = self.metadata['id']
        path_lower = self.metadata['path_lower']
        mime_type = self.metadata['mimeType']

        try:
            meta, resp = self.service.files_download(file_id or path_lower)
            data = resp.content
        
            if mime_type == "application/pdf":
                fh = io.BytesIO(data)
                reader = PdfReader(fh)
                return "\n".join([(p.extract_text() or "") for p in reader.pages]).strip()
        
            elif mime_type in ("text/plain", "text/markdown"):
                return data.decode("utf-8", errors="ignore")
        
        except ApiError:
            return None
        
        return None


def _ms_headers(token_dict):
    return {"Authorization": f"Bearer {token_dict['access_token']}"}

class OnedriveFile(VDBFile):
    def __init__(self, metadata, token):
        super().__init__(metadata)
        self.token = token

    def get_text(self) -> str:
        item_id = self.metadata['id']
        mime = self.metadata.get("mimeType", '').lower()
        
        headers = _ms_headers(self.token)
        url = f"{GRAPH}/me/drive/items/{item_id}/content"
        r = requests.get(url, headers=headers, timeout=60)

        if r.status_code == 403:
            return None
        
        r.raise_for_status()
        data = r.content
        
        if mime == "application/pdf":
            fh = io.BytesIO(data)
            reader = PdfReader(fh)
            return "\n".join([(p.extract_text() or "") for p in reader.pages]).strip()
        
        else:
            try:
                return data.decode("utf-8", errors="ignore")
        
            except Exception:
                return None
