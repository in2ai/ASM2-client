import os, logging
from dotenv import load_dotenv

from qdrant_client.http.models import SearchParams

# Load .env file
load_dotenv(override=True)

# Drive
CLIENT_SECRET_FILE  = "client_secret.json"
SCOPES              = ["https://www.googleapis.com/auth/drive.readonly"]
GDRIVE_ROOT         = (os.getenv("GDRIVE_ROOT") or "").strip().strip('"').strip("'")
REDIRECT_URI        = (os.getenv("REDIRECT_URI") or "").strip().strip('"').strip("'")

logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)

# OpenAI
OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip().strip('"').strip("'")

# Dropbox
DROPBOX_APP_KEY    = (os.getenv("DROPBOX_APP_KEY") or "").strip().strip('"').strip("'")
DROPBOX_APP_SECRET = (os.getenv("DROPBOX_APP_SECRET") or "").strip().strip('"').strip("'")
DROPBOX_ROOT       = (os.getenv("DROPBOX_ROOT") or "/").strip()  # carpeta a indexar

# OneDrive
ONEDRIVE_CLIENT_ID = (os.getenv("ONEDRIVE_CLIENT_ID") or "").strip()
ONEDRIVE_TENANT_ID = (os.getenv("ONEDRIVE_TENANT_ID") or "").strip()
ONEDRIVE_AUTHORITY = f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}"
ONEDRIVE_SCOPES = ["Files.Read.All", "User.Read"]
ONEDRIVE_ROOT = (os.getenv("ONEDRIVE_ROOT") or "").strip()   # p.ej. "", "/RAG"
GRAPH = "https://graph.microsoft.com/v1.0"

# Search config
APPROX_SEARCH_PARAMS = SearchParams(hnsw_ef=256, exact=False)