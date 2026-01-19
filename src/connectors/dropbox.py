import io

import dropbox
from dropbox.exceptions import ApiError

from PyPDF2 import PdfReader

from qdrant_client.http.models import Filter, FieldCondition, MatchValue, MatchAny

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

        st.session_state.dropbox_principals = get_authenticated_dropbox_principals(dbx)

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
    

def get_dropbox_file_principals(dbx: dropbox.Dropbox, file_id_or_path: str, page_limit: int = 100):
    principals = set()
    acl_anyone = False

    try:
        res = dbx.sharing_list_file_members(
            file=file_id_or_path,
            include_inherited=True,
            limit=page_limit,
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
        cont = dbx.sharing_list_file_members_continue(cursor=cursor)
        process_page(cont)
        has_more = getattr(cont, "has_more", False)
        cursor = getattr(cont, "cursor", None)

    # Check shared links to detect 'anyone with link' / public link
    try:
        links_res = dbx.sharing_list_shared_links(path=file_id_or_path)
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


def get_authenticated_dropbox_principals(dbx):
    acct = dbx.users_get_current_account()

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


def get_dropbox_qdrant_filter(auth_principals):
    # source == "Dropbox"
    source_condition = FieldCondition(
        key="metadata.source",
        match=MatchValue(value="Dropbox")
    )

    # permissions.anyone == True
    anyone_condition = FieldCondition(
        key="metadata.permissions.anyone",
        match=MatchValue(value=True)
    )

    allowed_condition = FieldCondition(
        key="metadata.permissions.allowed",
        match=MatchAny(any=auth_principals)
    )

    # anyone_condition OR allowed_condition
    or_block = Filter(
        should=[anyone_condition, allowed_condition],
    )

    # source_condition AND or_block
    final_filter = Filter(
        must=[source_condition, or_block]
    )

    return final_filter
    
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
            "webViewLink": get_dropbox_link(dbx, f.path_lower),
            "permissions": get_dropbox_file_principals(dbx, f.id or f.path_lower)
        } 
        for f in files
    ]

    files = [DropboxFile(f, dbx) for f in files]

    # Populate vector DB
    return build_vectorstore(files, 'Dropbox')