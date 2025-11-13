import os, logging
from dotenv import load_dotenv

import streamlit as st

load_dotenv(override=True)

CLIENT_SECRET_FILE = "client_secret.json"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

OPENAI_API_KEY = (os.getenv("OPENAI_API_KEY") or "").strip().strip('"').strip("'")
FOLDER_ID      = (os.getenv("FOLDER_ID") or "").strip().strip('"').strip("'")
REDIRECT_URI   = (os.getenv("REDIRECT_URI") or "").strip().strip('"').strip("'")

# Dropbox
DROPBOX_APP_KEY    = (os.getenv("DROPBOX_APP_KEY") or "").strip().strip('"').strip("'")
DROPBOX_APP_SECRET = (os.getenv("DROPBOX_APP_SECRET") or "").strip().strip('"').strip("'")
DROPBOX_ROOT       = (os.getenv("DROPBOX_ROOT") or "/").strip()  # carpeta a indexar

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_IN2AI = os.path.join(BASE_DIR, "img", "in2ai.png")
LOGO_IGAPE = os.path.join(BASE_DIR, "img", "igape.png")

if not OPENAI_API_KEY:
    st.error("❌ Falta OPENAI_API_KEY en .env"); st.stop()
if not FOLDER_ID:
    st.error("❌ Falta FOLDER_ID en .env"); st.stop()
if not REDIRECT_URI:
    st.error("❌ Falta REDIRECT_URI en .env"); st.stop()

logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)
st.set_page_config(page_title="RAG Drive + Dropbox ACL", page_icon="💬", layout="wide")

# OneDrive (Microsoft Graph)
ONEDRIVE_CLIENT_ID = (os.getenv("ONEDRIVE_CLIENT_ID") or "").strip()
ONEDRIVE_TENANT_ID = (os.getenv("ONEDRIVE_TENANT_ID") or "").strip()
ONEDRIVE_AUTHORITY = f"https://login.microsoftonline.com/{ONEDRIVE_TENANT_ID}"
ONEDRIVE_SCOPES = ["Files.Read.All", "User.Read"]
ONEDRIVE_ROOT = (os.getenv("ONEDRIVE_ROOT") or "").strip()   # p.ej. "", "/RAG"
GRAPH = "https://graph.microsoft.com/v1.0"