import logging
from dotenv import load_dotenv

from qdrant_client.http.models import SearchParams
from src.config.env import get_env

# Load .env file
load_dotenv(override=True)

# Drive
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
CLIENT_SECRET_FILE = get_env(
    "GOOGLE_CLIENT_SECRET_FILE",
    get_env("CLIENT_SECRET_FILE", "secrets/client_secret.json"),
)
# Google OAuth client JSON from env (same shape as secrets/client_secret.json). Overrides file when set and valid.
CLIENT_SECRET = get_env("CLIENT_SECRET")
GDRIVE_ROOT = get_env("GDRIVE_ROOT", get_env("FOLDER_ID", "")).strip()

logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)

# OpenAI
OPENAI_API_KEY = get_env("OPENAI_API_KEY", "")

# Dropbox
DROPBOX_APP_KEY    = get_env("DROPBOX_APP_KEY", "")
DROPBOX_APP_SECRET = get_env("DROPBOX_APP_SECRET", "")
DROPBOX_ROOT       = get_env("DROPBOX_ROOT", "/")  # carpeta a indexar

# OneDrive
ONEDRIVE_CLIENT_ID = get_env("ONEDRIVE_CLIENT_ID", "")
ONEDRIVE_TENANT_ID = get_env("ONEDRIVE_TENANT_ID", "")
ONEDRIVE_AUTHORITY = f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}"
ONEDRIVE_SCOPES = ["Files.Read.All", "User.Read"]
ONEDRIVE_ROOT = get_env("ONEDRIVE_ROOT", "")   # p.ej. "", "/RAG"
GRAPH = "https://graph.microsoft.com/v1.0"

# Search config
APPROX_SEARCH_PARAMS = SearchParams(hnsw_ef=256, exact=False)
