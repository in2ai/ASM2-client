import io

import dropbox
from dropbox.exceptions import ApiError

from PyPDF2 import PdfReader

from src.config.config import *
from src.connectors.vdb_file import DropboxFile
from src.connectors.store import build_vectorstore

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
            scope=["files.metadata.read", "files.content.read", "account_info.read", "sharing.read", "sharing.write"],
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


def guess_mime_from_name(name: str) -> str:
    n = (name or "").lower()
    if n.endswith(".pdf"): return "application/pdf"
    if n.endswith(".md"):  return "text/markdown"
    if n.endswith(".txt"): return "text/plain"
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
    except ApiError:
        return None
    return None

def dropbox_can_read(dbx, file_id: str) -> bool:
    try:
        dbx.files_get_metadata(file_id)
        return True
    except ApiError:
        return False

def get_dropbox_link(dbx, path_lower):
    """Obtiene o crea un enlace compartido para un archivo de Dropbox."""
    try:
        # Primero, intentar obtener enlaces compartidos existentes
        links = dbx.sharing_list_shared_links(path=path_lower, direct_only=True)
        if links.links:
            return links.links[0].url
        
        # Si no existe ningún enlace, crear uno
        shared_link = dbx.sharing_create_shared_link_with_settings(path_lower)
        return shared_link.url
    except ApiError as e:
        if hasattr(e.error, 'is_shared_link_already_exists') and e.error.is_shared_link_already_exists():
            links = dbx.sharing_list_shared_links(path=path_lower, direct_only=True)
            if links.links:
                return links.links[0].url
        return None
    
# ─────────────────────────────────────────────────────────────────────────────
# CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

def construir_vectorstore_dropbox():
    dbx = st.session_state.dbx

    # Create file list
    files = dropbox_list_files(dbx, DROPBOX_ROOT or "")
    
    files = [
        {
            "id": f.id, 
            "name": f.name, 
            "path_lower": f.path_lower, 
            "modifiedTime": f.client_modified.isoformat(),
            "mimeType": guess_mime_from_name(f.name),
            "webViewLink": get_dropbox_link(dbx, f.path_lower)
        } 
        for f in files
    ]

    files = [DropboxFile(f, dbx) for f in files]

    # Populate vector DB
    return build_vectorstore(files, 'Dropbox')