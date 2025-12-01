# app.py
# ─────────────────────────────────────────────────────────────────────────────
# RAG sobre Google Drive ,Dropbox y One Drive con ACL:
# - El índice puede crearlo un “superusuario”.
# - Cada consulta se valida con las credenciales del usuario actual (Drive/Dropbox).
# - Drive guarda ACL (permissionIds/domains/anyone) y valida en vivo.
# - Dropbox valida en vivo con el token del usuario conectado.
# - Selector para preguntar a Drive, Dropbox o ambos.
# ─────────────────────────────────────────────────────────────────────────────

import os, io, json, time, logging, unicodedata, re
from datetime import datetime

import numpy as np
import streamlit as st
import faiss

from dotenv import load_dotenv
from PyPDF2 import PdfReader

# Google APIs
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import InstalledAppFlow, Flow
from google.oauth2.credentials import Credentials

# Dropbox SDK
import dropbox
from dropbox.exceptions import ApiError

# LangChain v0.2
from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
# from langchain.schema import Document
from langchain_core.messages import SystemMessage, HumanMessage

# One drive
import requests
import msal
import traceback

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# ESTILOS
# ─────────────────────────────────────────────────────────────────────────────

st.markdown("""
<style>
.topbar{display:flex;justify-content:space-between;align-items:center;
padding:6px 10px;border-bottom:1px solid #eaeaea;margin-bottom:8px;}
.topbar img{height:40px;}
.chat-bubble-user{
  background:#dcf8c6;border-radius:20px;padding:10px 14px;display:inline-block;
  margin:6px 0;max-width:80%;
}
.chat-bubble-bot{
  background:#ffffff;border:1px solid #eee;border-radius:20px;padding:10px 14px;
  display:inline-block;margin:6px 0;max-width:80%;
}
.chat-row{display:flex;align-items:flex-start;}
.chat-row.user{justify-content:flex-end;}
.chat-row.bot{justify-content:flex-start;}
section[data-testid="stSidebar"] .block-container { display:flex; flex-direction:column; align-items:center; text-align:center; }
section[data-testid="stSidebar"] img { display:block; margin-left:auto; margin-right:auto; }
section[data-testid="stSidebar"] .stButton>button { width:100%; max-width:240px; margin:0 auto; }
</style>
""", unsafe_allow_html=True)

st.markdown("""
<script>
  const url = new URL(window.location.href);
  if (url.pathname === '/oauth2callback' && !url.search) {
    window.history.replaceState({}, '', '/');
  }
</script>
""", unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS COMUNES
# ─────────────────────────────────────────────────────────────────────────────

def safe_execute(request, retries=6, backoff=1.7):
    for i in range(retries):
        try:
            return request.execute()
        except HttpError as e:
            if getattr(e, "resp", None) and e.resp.status in (500, 502, 503, 504):
                time.sleep(backoff ** i)
                continue
            raise
    raise RuntimeError("Google API: demasiados fallos consecutivos (5xx).")

def _cosine(a, b):
    a = np.array(a); b = np.array(b)
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-12
    return float(np.dot(a, b) / denom)

def _extract_docx_bytes_to_text(data: bytes) -> str:
    """Convierte un .docx (bytes) a texto plano."""
    fh = io.BytesIO(data)
    try:
        doc = DocxDocument(fh)
    except Exception:
        return ""
    # Concatenar párrafos no vacíos
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()).strip()


# ─────────────────────────────────────────────────────────────────────────────
# GOOGLE DRIVE
# ─────────────────────────────────────────────────────────────────────────────

def oauth_login_drive():
    """
    Web OAuth para Drive (robusto en Streamlit + Docker):
    - Si vuelve ?code=..., se intercambia.
    - Si el code está caducado/ya usado (invalid_grant), se limpia la URL y se reinicia el login.
    - Si aún no hay code, muestra la URL de autorización.
    """
    if not os.path.exists(CLIENT_SECRET_FILE):
        st.error(f"❌ No existe {CLIENT_SECRET_FILE}. Revisa el client web en Google Cloud.")
        st.stop()
    if not REDIRECT_URI:
        st.error("❌ Falta REDIRECT_URI en .env (debe coincidir EXACTAMENTE con la registrada).")
        st.stop()

    # ---------- Helpers ----------
    def _get_qp():
        # Streamlit 1.33+ (st.query_params) y compatibilidad con anteriores
        try:
            qp = st.query_params
            if hasattr(qp, "items"):
                return {k: v for k, v in qp.items()}
        except Exception:
            pass
        try:
            return st.experimental_get_query_params() or {}
        except Exception:
            return {}

    def _clear_qp():
        # Borra ?code,&state,&scope de la URL para evitar reintentos
        try:
            st.query_params.update({})
            return
        except Exception:
            pass
        try:
            st.experimental_set_query_params()
        except Exception:
            pass

    def _first(v):
        return v[0] if isinstance(v, list) else v

    # ------------------------- Lógica principal ------------------------------
    qp = _get_qp()
    incoming_code   = _first(qp.get("code"))   if qp.get("code")   else None
    incoming_state  = _first(qp.get("state"))  if qp.get("state")  else None
    incoming_scope  = _first(qp.get("scope"))  if qp.get("scope")  else None
    scopes_callback = [s for s in (incoming_scope or "").split() if s] or None

    # 1) Si ya tenemos ?code=..., intentamos intercambiarlo
    if incoming_code:
        try:
            flow = Flow.from_client_secrets_file(
                CLIENT_SECRET_FILE,
                scopes=scopes_callback or SCOPES,   # ← usa los scopes de retorno si vienen
                redirect_uri=REDIRECT_URI,
            )

            # El 'state' no es obligatorio para seguir, solo aviso
            sess_state = st.session_state.get("oauth_state")
            if sess_state and incoming_state and incoming_state != sess_state:
                st.warning("Aviso: 'state' no coincide (posible reinicio de sesión). Continuamos…")

            flow.fetch_token(code=incoming_code)
            creds = flow.credentials
            service = build("drive", "v3", credentials=creds)

            st.session_state.service = service
            st.session_state.pop("oauth_state", None)
            _clear_qp()  # limpia ?code&state&scope para no reintentar

            st.success("✅ Autenticación correcta (Drive).")
            return service

        except HttpError as e:
            # Si es un invalid_grant, tratamos el code como caducado/usado
            msg = str(e)
            if "invalid_grant" in msg:
                st.info("El código de Google ya estaba usado o caducado. Reiniciando login…")
                st.session_state.pop("oauth_state", None)
                _clear_qp()
                # NO hacemos st.stop() → seguimos abajo y arrancamos un flujo nuevo
            else:
                st.error(f"Error de Google API: {e}")
                st.stop()
        except Exception as e:
            msg = str(e)
            if "invalid_grant" in msg:
                st.info("El código de Google ya estaba usado o caducado. Reiniciando login…")
                st.session_state.pop("oauth_state", None)
                _clear_qp()
            else:
                st.error(f"Error en Web OAuth (intercambiando code): {e}")
                st.stop()

    # 2) Sin code (o lo hemos limpiado) → inicia autorización y muestra URL
    try:
        flow = Flow.from_client_secrets_file(
            CLIENT_SECRET_FILE,
            scopes=SCOPES,
            redirect_uri=REDIRECT_URI,
        )
        auth_url, state = flow.authorization_url(
            prompt="consent",
            access_type="offline",
            include_granted_scopes="true",  # si te vuelve a mezclar scopes, el paso 1 ya lo maneja
        )
        st.session_state["oauth_state"] = state

        st.markdown("### 🔑 Autenticación con Google Drive")
        st.markdown(f"[Autorizar con Google]({auth_url})")
        st.code(REDIRECT_URI, language="text")
        st.stop()

    except HttpError as e:
        st.error(f"Error de Google API: {e}")
        st.stop()
    except Exception as e:
        st.error(f"Error iniciando Web OAuth: {e}")
        st.stop()


def listar_bfs_drive(service, root_folder_id):
    queue = [root_folder_id]
    files = []
    while queue:
        current = queue.pop(0)
        page_token = None
        while True:
            resp = safe_execute(
                service.files().list(
                    q=f"'{current}' in parents and trashed=false",
                    fields="nextPageToken, files(id,name,mimeType,modifiedTime)",
                    pageSize=1000, pageToken=page_token,
                    includeItemsFromAllDrives=True, supportsAllDrives=True
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
    return files

def extraer_texto_drive(service, file_id, mime_type):
    if mime_type == "application/pdf":
        data = safe_execute(service.files().get_media(fileId=file_id))
        fh = io.BytesIO(data)
        reader = PdfReader(fh)
        return "\n".join([(p.extract_text() or "") for p in reader.pages]).strip()
    elif mime_type == "application/vnd.google-apps.document":
        data = safe_execute(service.files().export(fileId=file_id, mimeType="text/plain"))
        return data.decode("utf-8", errors="ignore")
    elif mime_type in ("text/plain", "text/markdown"):
        data = safe_execute(service.files().get_media(fileId=file_id))
        return data.decode("utf-8", errors="ignore")
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        data = safe_execute(service.files().get_media(fileId=file_id))
        return _extract_docx_bytes_to_text(data)
    return None

def get_acl_drive(service, file_id):
    try:
        resp = safe_execute(service.permissions().list(
            fileId=file_id, fields="permissions(id,type,domain)", supportsAllDrives=True
        ))
        perms = resp.get("permissions", []) or []
        return {
            "permissionIds": [p["id"] for p in perms if p.get("type") == "user" and "id" in p],
            "domains": [p["domain"].lower() for p in perms if p.get("type") == "domain" and p.get("domain")],
            "anyone": any(p.get("type") == "anyone" for p in perms),
        }
    except Exception:
        return {"permissionIds": [], "domains": [], "anyone": False}

def get_current_user_drive(service):
    me = safe_execute(service.about().get(fields="user(emailAddress,permissionId)")) or {}
    u = me.get("user", {}) or {}
    email = (u.get("emailAddress") or "").lower()
    domain = email.split("@")[-1] if "@" in email else ""
    return {"email": email, "permissionId": u.get("permissionId"), "domain": domain.lower()}

# cache de verificación en vivo (drive)
def _live_cache_get(key):
    cache = st.session_state.setdefault("drive_live_check", {})
    v = cache.get(key)
    if not v: return None
    if time.time() - v["ts"] > 300: return None
    return v["ok"]

def _live_cache_set(key, ok):
    cache = st.session_state.setdefault("drive_live_check", {})
    cache[key] = {"ok": bool(ok), "ts": time.time()}

def drive_can_read(service, file_id: str) -> bool:
    if not file_id: return False
    ck = f"id:{file_id}"
    cached = _live_cache_get(ck)
    if cached is not None: return cached
    try:
        safe_execute(service.files().get(fileId=file_id, fields="id", supportsAllDrives=True))
        _live_cache_set(ck, True); return True
    except HttpError as e:
        if getattr(e, "resp", None) and e.resp.status in (403, 404):
            _live_cache_set(ck, False); return False
        _live_cache_set(ck, False); return False
    except Exception:
        _live_cache_set(ck, False); return False

# ─────────────────────────────────────────────────────────────────────────────
# DROPBOX
# ─────────────────────────────────────────────────────────────────────────────

def oauth_dropbox():
    if not DROPBOX_APP_KEY or not DROPBOX_APP_SECRET:
        st.error("❌ Falta DROPBOX_APP_KEY o DROPBOX_APP_SECRET en .env")
        return None

    # Crea el flow una vez y guárdalo (PKCE)
    if "dbx_auth_flow" not in st.session_state:
        st.session_state.dbx_auth_flow = dropbox.DropboxOAuth2FlowNoRedirect(
            consumer_key=DROPBOX_APP_KEY,
            consumer_secret=DROPBOX_APP_SECRET,
            token_access_type="offline",
            scope=["files.metadata.read", "files.content.read"],
            include_granted_scopes="user",
            use_pkce=True,
        )
        st.session_state.dbx_authorize_url = st.session_state.dbx_auth_flow.start()
        st.session_state.dbx_code = ""  # buffer del código

    st.markdown("### 🔑 Conectar Dropbox")
    st.write("1) Abre esta URL, autoriza la app y copia el **código**:")
    st.code(st.session_state.dbx_authorize_url, language="text")

    # Campo persistente (sin form)
    st.session_state.dbx_code = st.text_input(
        "2) Pega aquí el código de autorización de Dropbox",
        value=st.session_state.get("dbx_code", ""),
    )

    col1, col2 = st.columns(2)
    finish = col1.button("Finalizar conexión Dropbox")
    cancel = col2.button("Cancelar")

    if cancel:
        for k in ("dbx_auth_flow", "dbx_authorize_url", "dbx_code"):
            st.session_state.pop(k, None)
        st.info("Conexión Dropbox cancelada.")
        return None

    if not finish:
        return None

    # Limpiar y aceptar también URL completa pegada
    code = (st.session_state.get("dbx_code") or "").strip()
    code = code.lstrip(":").strip()
    if code.startswith("http"):
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(code).query)
        code = (qs.get("code") or [""])[0].strip()

    if not code:
        st.warning("Pega el código primero.")
        return None

    try:
        oauth_result = st.session_state.dbx_auth_flow.finish(code)
        for k in ("dbx_auth_flow", "dbx_authorize_url", "dbx_code"):
            st.session_state.pop(k, None)

        dbx = dropbox.Dropbox(
            oauth2_access_token=oauth_result.access_token,
            oauth2_refresh_token=oauth_result.refresh_token,
            app_key=DROPBOX_APP_KEY,
            app_secret=DROPBOX_APP_SECRET,
        )
        _ = dbx.users_get_current_account()
        st.success("✅ Dropbox conectado")
        return dbx
    except Exception as e:
        st.error(f"Error conectando a Dropbox: {e}")
        return None


def dropbox_list_files(dbx, root_path):
    root = "" if not root_path or root_path.strip() in ("", "/") else root_path.strip()
    if root and not root.startswith("/"):
        root = "/" + root

    files = []
    try:
        res = dbx.files_list_folder(root, recursive=True, include_non_downloadable_files=False)
        while True:
            for e in res.entries:
                if isinstance(e, dropbox.files.FileMetadata):
                    files.append(e)
            if res.has_more:
                res = dbx.files_list_folder_continue(res.cursor)
            else:
                break
    except ApiError as e:
        st.error(f"Error listando Dropbox en '{root}': {e}"); st.stop()
    return files


def _guess_mime_from_name(name: str) -> str:
    n = (name or "").lower()
    if n.endswith(".pdf"): return "application/pdf"
    if n.endswith(".md"):  return "text/markdown"
    if n.endswith(".txt"): return "text/plain"
    if n.endswith(".docx"): return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return "application/octet-stream"

def dropbox_read_text(dbx, file_id=None, path_lower=None, mime=None):
    path_or_id = file_id or path_lower
    try:
        meta, resp = dbx.files_download(path_or_id)
        data = resp.content
        if mime == "application/pdf":
            fh = io.BytesIO(data); reader = PdfReader(fh)
            return "\n".join([(p.extract_text() or "") for p in reader.pages]).strip()
        elif mime in ("text/plain", "text/markdown"):
            return data.decode("utf-8", errors="ignore")
        elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return _extract_docx_bytes_to_text(data)
    except ApiError:
        return None
    return None

def dropbox_can_read(dbx, file_id: str) -> bool:
    try:
        dbx.files_get_metadata(file_id)
        return True
    except ApiError:
        return False

    
# ─────────────────────────────────────────────────────────────────────────────
# ONEDRIVE (MICROSOFT GRAPH)
# ─────────────────────────────────────────────────────────────────────────────

def _ms_headers(token_dict):
    return {"Authorization": f"Bearer {token_dict['access_token']}"}

# ─────────────────────────────────────────────────────────────────────────────
# ONEDRIVE (MICROSOFT GRAPH) — Device Code Flow sólido y único
# ─────────────────────────────────────────────────────────────────────────────

def onedrive_device_login():
    """
    OneDrive login simplificado (MSAL Device Code), estilo oauth_login_drive:
    - Un único método con UI mínima.
    - Muestra enlace de autorización; al pulsar “He autorizado” canjea el código.
    - Guarda el token en st.session_state.onedrive_token y lo devuelve.
    - No solicita scopes reservados ('offline_access', 'openid', 'profile').
    - Usa tenant específico si ONEDRIVE_TENANT_ID está definido; si no, 'common'.
    """
    # Validaciones básicas
    if not ONEDRIVE_CLIENT_ID:
        st.error("❌ Falta ONEDRIVE_CLIENT_ID en .env"); st.stop()

    # Scopes por defecto y limpieza de reservados
    default_scopes = ["Files.Read", "User.Read"]
    scopes_env = (ONEDRIVE_SCOPES or default_scopes)
    scopes = list({*scopes_env})  # dedup
    for reserved in ("offline_access", "openid", "profile"):
        if reserved in scopes:
            scopes.remove(reserved)

    # Authority (tenant específico o 'common')
    tenant = (ONEDRIVE_TENANT_ID or "").strip() or "common"
    authority = f"https://login.microsoftonline.com/{tenant}"

    # Inicia o reutiliza el Device Code flow
    if "od_flow" not in st.session_state:
        try:
            app = msal.PublicClientApplication(client_id=ONEDRIVE_CLIENT_ID, authority=authority)
            flow = app.initiate_device_flow(scopes=scopes)
            if "user_code" not in flow:
                err = flow.get("error_description") or flow.get("error") or "Error iniciando Device Code flow"
                st.error(f"❌ {err}"); st.stop()
            st.session_state["od_flow"] = flow
            st.session_state["od_authority"] = authority
        except Exception as e:
            st.error(f"❌ Error MSAL: {e}"); st.stop()

    # UI mínima (idéntico patrón a Drive)
    flow = st.session_state["od_flow"]
    verify_url = flow.get("verification_uri_complete") or flow.get("verification_uri") or "https://microsoft.com/devicelogin"
    user_code = flow.get("user_code", "")

    st.markdown("### 🔐 Conectar OneDrive")
    st.markdown(f"[Abrir página de autorización]({verify_url})")
    if "verification_uri_complete" not in flow and user_code:
        st.write("Si te pide un código, introduce este:")
        st.code(user_code, language="text")

    col1, col2, col3 = st.columns(3)
    go     = col1.button("🚀 He autorizado", use_container_width=True, type="primary")
    reset  = col2.button("🔁 Reiniciar", use_container_width=True)
    cancel = col3.button("Cancelar", use_container_width=True)

    if reset:
        st.session_state.pop("od_flow", None)
        st.session_state.pop("od_authority", None)
        st.info("Flujo reiniciado. Vuelve a pulsar el botón para generar una nueva URL.")
        st.stop()

    if cancel:
        st.session_state.pop("od_flow", None)
        st.session_state.pop("od_authority", None)
        st.info("Conexión OneDrive cancelada.")
        st.stop()

    if not go:
        st.stop()

    # Canjea y guarda token
    try:
        app = msal.PublicClientApplication(client_id=ONEDRIVE_CLIENT_ID, authority=st.session_state["od_authority"])
        result = app.acquire_token_by_device_flow(flow)
        if "access_token" not in result:
            err = result.get("error_description") or result.get("error") or "No se obtuvo access_token"
            st.error(f"❌ Error en la autorización: {err}")
            st.session_state.pop("od_flow", None)
            st.session_state.pop("od_authority", None)
            st.stop()

        st.session_state.onedrive_token = result
        st.session_state.pop("od_flow", None)
        st.session_state.pop("od_authority", None)
        st.success("✅ OneDrive conectado.")
        try:
            st.rerun()
        except Exception:
            try:
                st.experimental_rerun()
            except Exception:
                pass
        return result
    
    except Exception as e:
        st.error(f"❌ Error canjeando el código: {e}")
        st.session_state.pop("od_flow", None)
        st.session_state.pop("od_authority", None)
        st.stop()


def onedrive_list_files(token_dict, root_path):
    """Lista recursivamente archivos (pdf/txt/md) desde root_path ('' o '/subcarpeta')."""
    headers = _ms_headers(token_dict)

    # ---- PRE-CHEQUEO: ¿tiene OneDrive aprovisionado y permisos? ----
    probe = requests.get(f"{GRAPH}/me/drive", headers=headers, timeout=20)
    if probe.status_code != 200:
        try:
            err = probe.json().get("error", {})
            code = err.get("code", "")
            msg  = err.get("message", "")
        except Exception:
            code = ""; msg = probe.text
        # Mensajes útiles
        if probe.status_code in (400, 404) and ("OneDrive" in msg or "drive" in msg.lower() or "site" in msg.lower()):
            raise RuntimeError(
                "OneDrive del usuario no está aprovisionado. Abre OneDrive una vez en el navegador "
                "(portal.office.com → OneDrive) para inicializarlo y vuelve a intentarlo."
            )
        if probe.status_code in (401, 403):
            raise RuntimeError(
                f"Permisos insuficientes en Graph (HTTP {probe.status_code}). "
                f"Código: {code or 'N/A'} · Mensaje: {msg or 'N/A'}. "
                "Comprueba que el login concedió 'Files.Read' o 'Files.Read.All' y que, si es un tenant corporativo, el admin dio consentimiento."
            )
        raise RuntimeError(f"Graph /me/drive devolvió {probe.status_code}. {code}: {msg}")

    # ---- Funciones auxiliares para listar ----
    def _children_url(path):
        if not path or path.strip() in ("", "/"):
            return f"{GRAPH}/me/drive/root/children?$select=id,name,file,folder,lastModifiedDateTime"
        p = path if path.startswith("/") else f"/{path}"
        return f"{GRAPH}/me/drive/root:{p}:/children?$select=id,name,file,folder,lastModifiedDateTime"

    files = []

    def walk(url):
        while url:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code == 404:
                st.warning(f"⚠️ La ruta de OneDrive {root_path!r} no existe. Usando raíz.")
                return walk(_children_url(""))
            if r.status_code >= 400:
                # Saca el detalle del error para ver realmente qué pasa
                try:
                    e = r.json().get("error", {})
                    code = e.get("code", "")
                    msg  = e.get("message", "")
                except Exception:
                    code = ""; msg = r.text
                raise RuntimeError(f"Graph dijo {r.status_code} {code}: {msg}")
            data = r.json()
            for it in data.get("value", []):
                if it.get("folder"):
                    sub_url = f"{GRAPH}/me/drive/items/{it['id']}/children?$select=id,name,file,folder,lastModifiedDateTime"
                    walk(sub_url)
                elif it.get("file"):
                    mime = (it["file"].get("mimeType") or "").lower()
                    files.append({
                        "id": it["id"],
                        "name": it["name"],
                        "mimeType": mime,
                        "modifiedTime": it.get("lastModifiedDateTime"),
                    })
            url = data.get("@odata.nextLink")

    walk(_children_url(root_path))
    keep = (
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    return [
        f for f in files
        if (
            f["mimeType"] in keep
            or f["name"].lower().endswith((".pdf", ".txt", ".md", ".docx"))
        )
    ]



def onedrive_download(token_dict, item_id, mime_hint=None):
    headers = _ms_headers(token_dict)
    url = f"{GRAPH}/me/drive/items/{item_id}/content"
    r = requests.get(url, headers=headers, timeout=60)
    if r.status_code == 403:
        return None
    r.raise_for_status()
    data = r.content
    mime = (mime_hint or "").lower()
    if mime == "application/pdf":
        fh = io.BytesIO(data)
        reader = PdfReader(fh)
        return "\n".join([(p.extract_text() or "") for p in reader.pages]).strip()
    elif mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return _extract_docx_bytes_to_text(data)
    else:
        try:
            return data.decode("utf-8", errors="ignore")
        except Exception:
            return None


def onedrive_can_read(token_dict, item_id: str) -> bool:
    headers = _ms_headers(token_dict)
    url = f"{GRAPH}/me/drive/items/{item_id}?$select=id"
    r = requests.get(url, headers=headers, timeout=20)
    return r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# PERMISOS UNIFICADOS
# ─────────────────────────────────────────────────────────────────────────────

def has_access(service_or_token, doc_metadata, user_ctx=None):
    """
    service_or_token:
      - Drive  -> objeto service de Google Drive
      - Dropbox -> instancia dropbox.Dropbox
      - OneDrive -> dict de token (resultado de MSAL con access_token)
    """
    meta = doc_metadata or {}
    src = (meta.get("source") or "").lower()
    fid = meta.get("id")

    if not fid:
        return False

    if src == "dropbox":
        # service_or_token es el cliente Dropbox
        return dropbox_can_read(service_or_token, fid)

    if src == "onedrive":
        # service_or_token es el token dict de MSAL
        return onedrive_can_read(service_or_token, fid)

    # Por defecto: Drive
    acl = meta.get("acl") or {}
    pid = user_ctx.get("permissionId") if user_ctx else None
    dom = (user_ctx.get("domain") or "").lower() if user_ctx else ""
    fast_allow = (
        acl.get("anyone")
        or (pid and pid in set(acl.get("permissionIds", [])))
        or (dom and dom in set(acl.get("domains", [])))
    )
    # valida en vivo siempre (por si cambió el ACL o acceso por grupo)
    return drive_can_read(service_or_token, fid) if fid else bool(fast_allow)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

def construir_vectorstore_drive_cached(files_serializable, creds_dict, batch_size=200, persist_path="faiss_index"):
    def load_manifest(path):
        if os.path.exists(path):
            try:
                return json.load(open(path, "r", encoding="utf-8"))
            except Exception:
                pass
        return {"files": {}, "total_chunks": 0}

    def save_manifest(path, state):
        tmp = path + ".tmp"
        json.dump(state, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    os.makedirs(persist_path, exist_ok=True)
    manifest_path = os.path.join(persist_path, "progress.json")
    state = load_manifest(manifest_path)
    files_state = state.get("files", {})

    # Lista actual de ficheros en Drive (ya la tienes serializada)
    files_list = [dict(t) if not isinstance(t, dict) else t for t in files_serializable]

    # Mapas por comodidad
    current_map = {f["id"]: f for f in files_list}
    known_ids   = set(files_state.keys())
    current_ids = set(current_map.keys())

    new_ids      = current_ids - known_ids
    maybe_mod_ids = current_ids & known_ids
    deleted_ids  = known_ids - current_ids

    # Detectar modificados comparando modifiedTime
    modified_ids = set()
    for fid in maybe_mod_ids:
        old_mt = files_state[fid].get("modifiedTime")
        new_mt = current_map[fid].get("modifiedTime")
        if new_mt and old_mt and new_mt != old_mt:
            modified_ids.add(fid)

    print(f"Drive sync → nuevos: {len(new_ids)} · modificados: {len(modified_ids)} · borrados: {len(deleted_ids)}")

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    try:
        vectorstore = FAISS.load_local(persist_path, embeddings, allow_dangerous_deserialization=True)
        print(f"📂 (Drive) Cargando índice desde {persist_path}")
    except Exception:
        index = faiss.IndexFlatL2(1536)
        vectorstore = FAISS(embedding_function=embeddings, index=index, docstore=InMemoryDocstore({}), index_to_docstore_id={})
        print(f"🆕 (Drive) Creando índice nuevo en {persist_path}")

    # Marcar como no activos los borrados y los modificados (porque sus chunks antiguos quedan "stale")
    for fid in deleted_ids | modified_ids:
        info = files_state.get(fid, {})
        info["active"] = False
        files_state[fid] = info

    # Si no hay nada nuevo/modificado, solo guardamos estado de borrados y salimos
    if not new_ids and not modified_ids:
        state["files"] = files_state
        save_manifest(manifest_path, state)
        print("✅ Índice de Drive sincronizado (sin nuevos embeddings).")
        return vectorstore

    service = build("drive", "v3", credentials=Credentials.from_authorized_user_info(creds_dict))
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

    docs_batch = []
    def flush():
        nonlocal docs_batch
        if not docs_batch:
            return
        vectorstore.add_documents(docs_batch)
        vectorstore.save_local(persist_path)
        print(f"🧩 (Drive) Persistidos {len(docs_batch)} chunks")
        docs_batch = []

    # Reindexar solo nuevos + modificados
    for fid in (list(new_ids) + list(modified_ids)):
        f = current_map[fid]
        name = f["name"]; mime = f["mimeType"]
        txt = extraer_texto_drive(service, fid, mime)
        if not txt:
            continue
        acl = get_acl_drive(service, fid)
        base_doc = Document(
            page_content=txt,
            metadata={
                "source": "drive",
                "title": name,
                "id": fid,
                "mimeType": mime,
                "modifiedTime": f.get("modifiedTime"),
                "acl": acl,
            },
        )
        chunks = splitter.split_documents([base_doc])
        docs_batch.extend(chunks)

        # Actualizar estado del fichero
        files_state[fid] = {
            "modifiedTime": f.get("modifiedTime"),
            "active": True
        }

        if len(docs_batch) >= batch_size:
            flush()

    if docs_batch:
        flush()

    state["files"] = files_state
    save_manifest(manifest_path, state)
    print(f"💾 (Drive) Índice guardado en {persist_path}")
    return vectorstore



def construir_vectorstore_drive(service):
    files = [f for f in listar_bfs_drive(service, FOLDER_ID) if f["mimeType"] in (
    "application/pdf",
    "application/vnd.google-apps.document",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )]

    files_small = [{"id": f["id"], "name": f["name"], "mimeType": f["mimeType"], "modifiedTime": f.get("modifiedTime")} for f in files]
    files_serializable = tuple(tuple(sorted(d.items())) for d in files_small)
    creds = service._http.credentials
    creds_dict = {
        "token": creds.token,
        "refresh_token": getattr(creds, "refresh_token", None),
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(getattr(creds, "scopes", []) or SCOPES),
    }
    return construir_vectorstore_drive_cached(files_serializable, creds_dict)

def construir_vectorstore_dropbox_cached(file_tuples, token, batch_size=200, persist_path="faiss_index_dropbox"):
    """
    Indexado incremental de Dropbox:
    - Solo reembebe ficheros nuevos o modificados (por modifiedTime).
    - Mantiene el índice FAISS existente si ya existe.
    - NO borra vectores antiguos (FAISS no lo soporta bien), pero evita recalcular.
    """
    def load_manifest(path):
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"files": {}, "total_chunks": 0}

    def save_manifest(path, state):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    os.makedirs(persist_path, exist_ok=True)
    manifest_path = os.path.join(persist_path, "progress.json")
    state = load_manifest(manifest_path)
    files_state = state.get("files", {})

    # 🔎 Normalizamos: tuplas -> dicts
    file_dicts = [dict(t) if not isinstance(t, dict) else t for t in file_tuples]

    # Mapas útiles
    current_map = {f["id"]: f for f in file_dicts}
    known_ids   = set(files_state.keys())
    current_ids = set(current_map.keys())

    new_ids       = current_ids - known_ids
    maybe_mod_ids = current_ids & known_ids
    deleted_ids   = known_ids - current_ids

    # Detectar modificados comparando modifiedTime
    modified_ids = set()
    for fid in maybe_mod_ids:
        old_mt = files_state.get(fid, {}).get("modifiedTime")
        new_mt = current_map[fid].get("modifiedTime")
        if new_mt and old_mt and new_mt != old_mt:
            modified_ids.add(fid)

    print(f"Dropbox sync → nuevos: {len(new_ids)} · modificados: {len(modified_ids)} · borrados: {len(deleted_ids)}")

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    # ⚙️ Cargar índice existente o crear uno nuevo
    try:
        vectordb = FAISS.load_local(persist_path, embeddings, allow_dangerous_deserialization=True)
        print(f"📂 (Dropbox) Cargando índice desde {persist_path}")
    except Exception:
        index = faiss.IndexFlatL2(1536)
        vectordb = FAISS(
            embedding_function=embeddings,
            index=index,
            docstore=InMemoryDocstore({}),
            index_to_docstore_id={},
        )
        print(f"🆕 (Dropbox) Creando índice nuevo en {persist_path}")

    # Marcamos “borrados” y “modificados” como no activos (por si luego quieres filtrarlos)
    for fid in deleted_ids | modified_ids:
        info = files_state.get(fid, {})
        info["active"] = False
        files_state[fid] = info

    # Si no hay nada nuevo ni modificado → no reindexamos nada
    if not new_ids and not modified_ids:
        state["files"] = files_state
        save_manifest(manifest_path, state)
        print("✅ Índice de Dropbox sincronizado (sin nuevos embeddings).")
        return vectordb

    dbx = dropbox.Dropbox(token)
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

    docs_batch = []
    def flush():
        nonlocal docs_batch
        if not docs_batch:
            return
        vectordb.add_documents(docs_batch)
        vectordb.save_local(persist_path)
        print(f"🧩 (Dropbox) Persistidos {len(docs_batch)} chunks")
        docs_batch = []

    # 🔁 Reindexar SOLO nuevos + modificados
    # (los borrados simplemente ya no se reindexan)
    index_ids = list(new_ids) + list(modified_ids)
    for fid in index_ids:
        f = current_map[fid]
        name = f["name"]
        path_lower = f["path_lower"]
        mime = f["mimeType"]

        # Solo tipos soportados (ajusta si añadiste docx, etc.)
        if mime not in (
            "application/pdf",
            "text/plain",
            "text/markdown",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ):
            continue

        txt = dropbox_read_text(dbx, file_id=fid, path_lower=path_lower, mime=mime)
        if not txt:
            continue

        base = Document(
            page_content=txt,
            metadata={
                "source": "dropbox",
                "id": fid,
                "path_lower": path_lower,
                "title": name,
                "mimeType": mime,
            },
        )
        chunks = splitter.split_documents([base])
        docs_batch.extend(chunks)

        # Actualizar estado de este fichero
        files_state[fid] = {
            "modifiedTime": f.get("modifiedTime"),
            "active": True,
        }

        if len(docs_batch) >= batch_size:
            flush()

    if docs_batch:
        flush()

    state["files"] = files_state
    save_manifest(manifest_path, state)
    print(f"💾 (Dropbox) Índice guardado en {persist_path}")
    return vectordb


def construir_vectorstore_dropbox(dbx):
    """Orquesta el indexado de Dropbox (solo nuevos/modificados)."""
    root = (DROPBOX_ROOT or "").strip()
    print(f"(Dropbox) Indexando ruta raíz: {root!r}")

    files = dropbox_list_files(dbx, root or "")
    print(f"(Dropbox) Encontrados {len(files)} ficheros en {root!r}")
    for f in files[:20]:
        try:
            print(f"  - {f.path_lower}  (id={f.id})")
        except Exception:
            pass

    files_small = []
    for f in files:
        modified = None
        try:
            modified = f.server_modified.isoformat()
        except Exception:
            modified = None

        files_small.append({
            "id": f.id,
            "name": f.name,
            "path_lower": f.path_lower,
            "mimeType": _guess_mime_from_name(f.name),
            "modifiedTime": modified,
        })

    # Hacemos serializable para poder usarlo como “firma” si quisieras cachear
    files_serializable = tuple(tuple(sorted(d.items())) for d in files_small)
    return construir_vectorstore_dropbox_cached(files_serializable, dbx._oauth2_access_token)


def construir_vectorstore_drive_cached(files_serializable, creds_dict, batch_size=200, persist_path="faiss_index"):
    def load_manifest(path):
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "processed_ids": [],
            "total_chunks": 0,
            "completed": False,
            "started_at": datetime.now().isoformat()
        }

    def save_manifest(path, state):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    os.makedirs(persist_path, exist_ok=True)
    manifest_path = os.path.join(persist_path, "progress.json")
    state = load_manifest(manifest_path)
    processed_ids = set(state.get("processed_ids", []))
    total_chunks = int(state.get("total_chunks", 0))

    # Normalizamos files_serializable a lista de dicts
    files_list = [dict(t) if not isinstance(t, dict) else t for t in files_serializable]

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    # Cargar índice existente o crear uno nuevo
    try:
        vectorstore = FAISS.load_local(persist_path, embeddings, allow_dangerous_deserialization=True)
        print(f"📂 (Drive) Cargando índice desde {persist_path}")
    except Exception:
        index = faiss.IndexFlatL2(1536)
        vectorstore = FAISS(
            embedding_function=embeddings,
            index=index,
            docstore=InMemoryDocstore({}),
            index_to_docstore_id={},
        )
        print(f"🆕 (Drive) Creando índice nuevo en {persist_path}")

    # Solo procesar ficheros cuyo id NO está en processed_ids
    remaining_files = [f for f in files_list if f["id"] not in processed_ids]

    if not remaining_files:
        print("✅ Índice de Drive ya está actualizado (no hay ficheros nuevos).")
        return vectorstore

    # Cliente de Drive a partir de las credenciales serializadas
    service = build("drive", "v3", credentials=Credentials.from_authorized_user_info(creds_dict))
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

    docs_batch = []
    pending_ids = []

    def flush(reason="batch"):
        nonlocal docs_batch, pending_ids, total_chunks, state
        if not docs_batch:
            return
        vectorstore.add_documents(docs_batch)
        total_chunks += len(docs_batch)
        vectorstore.save_local(persist_path)
        for fid in pending_ids:
            processed_ids.add(fid)
        state.update({
            "processed_ids": list(processed_ids),
            "total_chunks": total_chunks,
            "completed": False
        })
        save_manifest(manifest_path, state)
        print(f"🧩 (Drive) Persistidos {len(docs_batch)} chunks [{reason}]")
        docs_batch, pending_ids = [], []

    # Indexar solo los nuevos ficheros
    for idx, f in enumerate(remaining_files):
        fid  = f["id"]
        name = f["name"]
        mime = f["mimeType"]
        print(f"(Drive) Indexando: {name} [{mime}] id={fid}")

        txt = extraer_texto_drive(service, fid, mime)
        if not txt:
            print(f"(Drive) Saltado (sin texto): {name}")
            continue

        acl = get_acl_drive(service, fid)
        base_doc = Document(
            page_content=txt,
            metadata={
                "source": "drive",
                "title": name,
                "id": fid,
                "mimeType": mime,
                "modifiedTime": f.get("modifiedTime"),
                "acl": acl,
            },
        )

        chunks = splitter.split_documents([base_doc])
        docs_batch.extend(chunks)
        pending_ids.append(fid)

        if len(docs_batch) >= batch_size:
            flush("lote")

    if docs_batch:
        flush("final")

    if not processed_ids and total_chunks == 0:
        raise RuntimeError("No se encontraron documentos legibles (Drive).")

    state["completed"] = True
    save_manifest(manifest_path, state)
    print(f"💾 (Drive) Índice guardado en {persist_path}")
    return vectorstore

def construir_vectorstore_onedrive_cached(file_tuples, token_dict, batch_size=200, persist_path="faiss_index_onedrive"):
    """
    Indexado incremental de OneDrive:
    - Solo reembebe ficheros nuevos o modificados (modifiedTime).
    - Marca como active=False los ficheros que ya no están.
    """
    def load_manifest(path):
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"files": {}, "total_chunks": 0}

    def save_manifest(path, state):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    os.makedirs(persist_path, exist_ok=True)
    manifest_path = os.path.join(persist_path, "progress.json")
    state = load_manifest(manifest_path)
    files_state = state.get("files", {})

    # Normalizar tuplas -> dicts
    file_dicts = [dict(t) if not isinstance(t, dict) else t for t in file_tuples]

    # Mapas útiles
    current_map = {f["id"]: f for f in file_dicts}
    known_ids   = set(files_state.keys())
    current_ids = set(current_map.keys())

    new_ids       = current_ids - known_ids
    maybe_mod_ids = current_ids & known_ids
    deleted_ids   = known_ids - current_ids

    # Detectar modificados
    modified_ids = set()
    for fid in maybe_mod_ids:
        old_mt = files_state.get(fid, {}).get("modifiedTime")
        new_mt = current_map[fid].get("modifiedTime")
        if new_mt and old_mt and new_mt != old_mt:
            modified_ids.add(fid)

    print(f"OneDrive sync → nuevos: {len(new_ids)} · modificados: {len(modified_ids)} · borrados: {len(deleted_ids)}")

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    # Cargar índice existente o crear uno nuevo
    try:
        vectordb = FAISS.load_local(persist_path, embeddings, allow_dangerous_deserialization=True)
        print(f"📂 (OneDrive) Cargando índice desde {persist_path}")
    except Exception:
        index = faiss.IndexFlatL2(1536)
        vectordb = FAISS(
            embedding_function=embeddings,
            index=index,
            docstore=InMemoryDocstore({}),
            index_to_docstore_id={},
        )
        print(f"🆕 (OneDrive) Creando índice nuevo en {persist_path}")

    # Marcar como no activos los borrados y los modificados
    for fid in deleted_ids | modified_ids:
        info = files_state.get(fid, {})
        info["active"] = False
        files_state[fid] = info

    # Si no hay nada que reindexar, solo guardamos estado
    if not new_ids and not modified_ids:
        state["files"] = files_state
        save_manifest(manifest_path, state)
        print("✅ Índice de OneDrive sincronizado (sin nuevos embeddings).")
        return vectordb

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

    docs_batch = []
    def flush():
        nonlocal docs_batch
        if not docs_batch:
            return
        vectordb.add_documents(docs_batch)
        vectordb.save_local(persist_path)
        print(f"🧩 (OneDrive) Persistidos {len(docs_batch)} chunks")
        docs_batch = []

    # Reindexar SOLO nuevos + modificados
    for fid in list(new_ids) + list(modified_ids):
        f = current_map[fid]
        name = f["name"]
        mime = (f.get("mimeType") or "").lower()

        txt = onedrive_download(token_dict, fid, mime_hint=mime)
        if not txt:
            continue

        base = Document(
            page_content=txt,
            metadata={
                "source": "onedrive",
                "id": fid,
                "title": name,
                "mimeType": mime,
            },
        )
        chunks = splitter.split_documents([base])
        docs_batch.extend(chunks)

        # Actualizar estado del fichero
        files_state[fid] = {
            "modifiedTime": f.get("modifiedTime"),
            "active": True,
        }

        if len(docs_batch) >= batch_size:
            flush()

    if docs_batch:
        flush()

    state["files"] = files_state
    save_manifest(manifest_path, state)
    print(f"💾 (OneDrive) Índice guardado en {persist_path}")
    return vectordb


def construir_vectorstore_onedrive(token_dict):
    files = onedrive_list_files(token_dict, ONEDRIVE_ROOT or "")
    files_small = [{"id": f["id"], "name": f["name"], "mimeType": f.get("mimeType", ""), "modifiedTime": f.get("modifiedTime")} for f in files]
    files_serializable = tuple(tuple(sorted(d.items())) for d in files_small)
    return construir_vectorstore_onedrive_cached(files_serializable, token_dict)



# ─────────────────────────────────────────────────────────────────────────────
# REINDEXAR MANUALMENTE (botón)
# ─────────────────────────────────────────────────────────────────────────────

def reindex_all_sources():
    """Reconstruye/actualiza los índices de las fuentes conectadas."""
    # Google Drive
    if "service" in st.session_state:
        with st.spinner("🔄 Reindexando Google Drive…"):
            st.session_state.vectordb = construir_vectorstore_drive(st.session_state.service)
        st.success("✅ Índice de Drive actualizado.")

    # Dropbox
    if st.session_state.get("dbx"):
        with st.spinner(f"🔄 Reindexando Dropbox ({DROPBOX_ROOT or '/'})…"):
            st.session_state.vectordb_dropbox = construir_vectorstore_dropbox(st.session_state.dbx)
        st.success("✅ Índice de Dropbox actualizado.")

    # OneDrive
    if st.session_state.get("onedrive_token"):
        try:
            with st.spinner(f"🔄 Reindexando OneDrive ({ONEDRIVE_ROOT or '/'})…"):
                st.session_state.vectordb_onedrive = construir_vectorstore_onedrive(st.session_state.onedrive_token)
            st.success("✅ Índice de OneDrive actualizado.")
        except Exception as e:
            st.error(f"❌ No se pudo reindexar OneDrive: {e}")




# ─────────────────────────────────────────────────────────────────────────────
# RESPONDER (multi-origen)
# ─────────────────────────────────────────────────────────────────────────────

def responder_multi(query, vectordbs, services, threshold=0.50, k=6, chunk_chars=1600):
    """
    vectordbs: lista de tuplas (source, vectordb) con source en {"drive","dropbox"}.
    services: dict {'drive': service_drive, 'dropbox': dbx}
    """
    emb = OpenAIEmbeddings(model="text-embedding-3-small")
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

    allowed_chunks = []

    # 1) Recuperar candidatos de cada origen y filtrar por permisos
    for source, vdb in vectordbs:
        cands = vdb.similarity_search(query, k=256)
        if source == "drive":
            user_ctx = get_current_user_drive(services["drive"])
            allowed = [d for d in cands if has_access(services["drive"], d.metadata, user_ctx)]
        elif source == "onedrive":
            allowed = [d for d in cands if has_access(services["onedrive_token"], d.metadata)]
        elif source == "dropbox":
            allowed = [d for d in cands if has_access(services["dropbox"], d.metadata)]
        else:
            allowed = []
        allowed_chunks.extend(allowed)
        print(f"🔎 {source}: cands={len(cands)} allowed={len(allowed)}")

    if not allowed_chunks:
        return "No hay contenido accesible relacionado con tu consulta en las fuentes seleccionadas."

    # 2) Re-ranking por similitud semántica
    q_vec = emb.embed_query(query)
    texts = [(d.page_content or "")[:chunk_chars] for d in allowed_chunks]
    d_vecs = emb.embed_documents(texts)
    paired = list(zip(allowed_chunks, [_cosine(q_vec, dv) for dv in d_vecs]))
    paired.sort(key=lambda x: x[1], reverse=True)

    picked = [d for d, s in paired if s >= float(threshold)][:k] or [d for d, s in paired[:k]]

    # 3) Contexto
    def cite(d):
        src = d.metadata.get("source","drive")
        tag = "Drive" if src == "drive" else "Dropbox"
        t = d.metadata.get("title","(sin título)")
        return f"[{tag}:{t}] {(d.page_content or '')[:chunk_chars]}"
    contexto = "\n\n".join(cite(d) for d in picked)

    # 4) LLM
    system = ("Eres un asistente RAG en ESPAÑOL. Responde SOLO con el CONTEXTO. "
              "Redacta en lenguaje natural, claro y directo. Cita los títulos entre corchetes.")
    user = f"CONTEXTO:\n{contexto}\n\nPREGUNTA:\n{query}"
    ans = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content
    if not ans or not ans.strip():
        t = picked[0].metadata.get("title", "(sin título)")
        ans = f"Según [{t}]: {(picked[0].page_content or '')[:chunk_chars]}"
    return ans

# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR (sesiones y fuentes)
# ─────────────────────────────────────────────────────────────────────────────

with st.sidebar:
    if os.path.exists(LOGO_IN2AI): st.image(LOGO_IN2AI, width=140)
    if os.path.exists(LOGO_IGAPE): st.image(LOGO_IGAPE, width=140)

    st.markdown("### 🔐 Google Drive")

    qp = st.query_params
    has_code = bool(qp.get("code"))
    drive_flow_started = "oauth_state" in st.session_state

    if "service" not in st.session_state:
        # Si hay code o el flujo estaba iniciado, reanuda SIN botón
        if has_code or drive_flow_started:
            service = oauth_login_drive()
            if service:
                st.session_state.service = service
                st.rerun()
        else:
            if st.button("Conectar con Google Drive", use_container_width=True):
                oauth_login_drive()
            st.info("Pulsa **Conectar con Google Drive** para empezar.")
    else:
        if st.button("Cerrar sesión Drive", use_container_width=True):
            for k in ("service","vectordb","drive_live_check","oauth_state"):
                st.session_state.pop(k, None)

            # 🔑 Limpia parámetros de la URL (code, state, scope…)
            try:
                st.query_params.update({})
            except Exception:
                try:
                    st.experimental_set_query_params()
                except Exception:
                    pass

            try:
                st.cache_resource.clear()
            except Exception:
                pass

            st.success("Sesión Drive cerrada.")
            st.rerun()


 
    st.markdown("### 🔐 OneDrive")
    if ONEDRIVE_CLIENT_ID:
        if "onedrive_token" not in st.session_state:
            # Si no estamos en modo auth, mostramos el botón para empezar
            if not st.session_state.get("odc_auth_mode"):
                if st.button("Conectar con OneDrive", use_container_width=True):
                    st.session_state["odc_auth_mode"] = True
                    st.rerun()
            else:
                # Estamos en modo auth: renderea SIEMPRE la UI de login (con el botón "He autorizado")
                tok = onedrive_device_login()   # esta función muestra la UI y hace st.stop() hasta terminar o cancelar
                if tok:
                    st.session_state.onedrive_token = tok
                    st.session_state.pop("odc_auth_mode", None)
                    st.rerun()
        else:
            if st.button("Desconectar OneDrive", use_container_width=True):
                for k in ("onedrive_token","vectordb_onedrive","odc_auth_mode","od_flow","od_authority"):
                    st.session_state.pop(k, None)
                st.success("OneDrive desconectado.")
                st.rerun()


    st.markdown("### 🔐 Dropbox")

    auth_mode = st.session_state.get("dbx_auth_mode", False)
    dbx = st.session_state.get("dbx")

    if not dbx and not auth_mode:
        if st.button("Conectar con Dropbox", use_container_width=True):
            st.session_state["dbx_auth_mode"] = True
            st.rerun()

    if not dbx and st.session_state.get("dbx_auth_mode"):
        # Muestra el flujo OAuth (sin spinner)
        dbx_client = oauth_dropbox()
        if dbx_client:
            st.session_state.dbx = dbx_client
            st.session_state.pop("dbx_auth_mode", None)
            try:
                acc = st.session_state.dbx.users_get_current_account()
                root_effective = (DROPBOX_ROOT or "").strip() or "(raíz de la app)"
                st.caption(f"Dropbox conectado como {acc.email} · Ruta efectiva: {root_effective}")
            except Exception:
                pass
            st.rerun()

    if st.session_state.get("dbx"):
        if st.button("Desconectar Dropbox", use_container_width=True):
            for k in ("dbx","vectordb_dropbox","dbx_auth_mode","dbx_auth_flow","dbx_authorize_url"):
                st.session_state.pop(k, None)
            st.success("Dropbox desconectado.")
            st.rerun()


    st.markdown("### ⚙️ Fuentes a consultar")

    options = []
    if st.session_state.get("service"):
        options.append("Drive")
    if st.session_state.get("dbx"):
        options.append("Dropbox")
    if st.session_state.get("onedrive_token"):   # ← añade OneDrive si hay token
        options.append("OneDrive")

    if options:
        sel = st.multiselect("Selecciona fuentes", options=options, default=options)
    else:
        st.info("Conecta al menos una fuente (Drive/Dropbox/OneDrive).")
        sel = []

    st.session_state.sources_selected = sel

    st.markdown("### 🎚️ Umbral de relevancia")
    threshold = st.slider("Umbral (0.0 = permisivo · 0.90 = estricto)", 0.0, 0.90, 0.55, 0.01)
    st.session_state.threshold = threshold

    st.markdown("### 🔄 Reindexar contenidos")
    st.caption("Pulsa para detectar e indexar nuevos ficheros en las fuentes conectadas.")

    if st.button("Reindexar ahora", use_container_width=True):
        reindex_all_sources()



# ─────────────────────────────────────────────────────────────────────────────
# CARGA / CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

if "service" in st.session_state and "vectordb" not in st.session_state:
    with st.spinner("Construyendo / Cargando índice de Drive…"):
        st.session_state.vectordb = construir_vectorstore_drive(st.session_state.service)
    st.success("✅ Índice de Drive listo.")

if st.session_state.get("dbx") and "vectordb_dropbox" not in st.session_state:
    with st.spinner(f"Construyendo / Cargando índice de Dropbox ({DROPBOX_ROOT or '/'})…"):
        st.session_state.vectordb_dropbox = construir_vectorstore_dropbox(st.session_state.dbx)
    st.success("✅ Índice de Dropbox listo.")
    try:
        n = st.session_state.vectordb_dropbox.index.ntotal
        st.caption(f"📌 Dropbox: índice con {n} vectores.")
        print(f"Dropbox FAISS ntotal = {n}")
    except Exception as e:
        st.write(f"Error inspeccionando índice Dropbox: {e}")

if st.session_state.get("onedrive_token") and "vectordb_onedrive" not in st.session_state:
    try:
        with st.spinner(f"Construyendo / Cargando índice de OneDrive ({ONEDRIVE_ROOT or '/'})…"):
            st.session_state.vectordb_onedrive = construir_vectorstore_onedrive(st.session_state.onedrive_token)
        st.success("✅ Índice de OneDrive listo.")
    except Exception as e:
        st.error(f"❌ No se pudo construir el índice de OneDrive: {e}")




# ─────────────────────────────────────────────────────────────────────────────
# UI PRINCIPAL (chat)
# ─────────────────────────────────────────────────────────────────────────────

st.title("ASM2 - RAG con ACL (Google Drive + One Drive + Dropbox)")

if "messages" not in st.session_state:
    st.session_state.messages = []

# Render historial
for m in st.session_state.messages:
    cls = "user" if m["role"] == "user" else "bot"
    bub = "chat-bubble-user" if m["role"] == "user" else "chat-bubble-bot"
    st.markdown(f'<div class="chat-row {cls}"><div class="{bub}">{m["content"]}</div></div>', unsafe_allow_html=True)

prompt = st.chat_input("Escribe tu mensaje…")
if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    st.markdown(f'<div class="chat-row user"><div class="chat-bubble-user">{prompt}</div></div>', unsafe_allow_html=True)
    with st.spinner("Pensando…"):
        try:
            sel = st.session_state.get("sources_selected") or []
            vectordbs = []; services = {}
            if "Drive" in sel and "vectordb" in st.session_state:
                vectordbs.append(("drive", st.session_state.vectordb))
                services["drive"] = st.session_state.service
            if "Dropbox" in sel and "vectordb_dropbox" in st.session_state and "dbx" in st.session_state:
                vectordbs.append(("dropbox", st.session_state.vectordb_dropbox))
                services["dropbox"] = st.session_state.dbx
            if "OneDrive" in sel and "vectordb_onedrive" in st.session_state and "onedrive_token" in st.session_state:
                vectordbs.append(("onedrive", st.session_state.vectordb_onedrive))
                services["onedrive_token"] = st.session_state.onedrive_token

            if not vectordbs:
                ans = "Conecta al menos una fuente (Drive/Dropbox) en la barra lateral."
            else:
                ans = responder_multi(
                    prompt, vectordbs, services,
                    threshold=st.session_state.get("threshold", 0.55), k=6
                )
        except Exception as e:
            ans = f"Error: {e}"
    st.markdown(f'<div class="chat-row bot"><div class="chat-bubble-bot">{ans}</div></div>', unsafe_allow_html=True)
    st.session_state.messages.append({"role": "assistant", "content": ans})
