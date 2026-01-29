import os, logging
from dotenv import load_dotenv

<<<<<<< HEAD
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
=======
import streamlit as st

from qdrant_client.http.models import SearchParams

load_dotenv(override=True)

CLIENT_SECRET_FILE = "client_secret.json"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip().strip('"').strip("'")
FOLDER_ID      = (os.getenv("FOLDER_ID") or "").strip().strip('"').strip("'")
REDIRECT_URI   = (os.getenv("REDIRECT_URI") or "").strip().strip('"').strip("'")
>>>>>>> 178d346 (backend restructuring)

# Dropbox
DROPBOX_APP_KEY    = (os.getenv("DROPBOX_APP_KEY") or "").strip().strip('"').strip("'")
DROPBOX_APP_SECRET = (os.getenv("DROPBOX_APP_SECRET") or "").strip().strip('"').strip("'")
DROPBOX_ROOT       = (os.getenv("DROPBOX_ROOT") or "/").strip()  # carpeta a indexar

<<<<<<< HEAD
# OneDrive
=======
# Rutas de imágenes (relativas a la raíz del proyecto)
LOGO_IN2AI = "img/in2ai.png"
LOGO_IGAPE = "img/igape.png"
LOGO_FINANCIACION = "img/logos_financiacion.png"

if not OPENAI_API_KEY:
    st.error("❌ Falta OPENAI_API_KEY en .env"); st.stop()
if not FOLDER_ID:
    st.error("❌ Falta FOLDER_ID en .env"); st.stop()
if not REDIRECT_URI:
    st.error("❌ Falta REDIRECT_URI en .env"); st.stop()

logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
st.set_page_config(page_title="ASM2 - Asistente Conversacional Multiempresa", page_icon="💬", layout="wide")

# OneDrive (Microsoft Graph)
>>>>>>> 178d346 (backend restructuring)
ONEDRIVE_CLIENT_ID = (os.getenv("ONEDRIVE_CLIENT_ID") or "").strip()
ONEDRIVE_TENANT_ID = (os.getenv("ONEDRIVE_TENANT_ID") or "").strip()
ONEDRIVE_AUTHORITY = f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}"
ONEDRIVE_SCOPES = ["Files.Read.All", "User.Read"]
ONEDRIVE_ROOT = (os.getenv("ONEDRIVE_ROOT") or "").strip()   # p.ej. "", "/RAG"
GRAPH = "https://graph.microsoft.com/v1.0"

# Search config
APPROX_SEARCH_PARAMS = SearchParams(hnsw_ef=256, exact=False)