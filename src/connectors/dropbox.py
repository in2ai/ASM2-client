import io

import faiss
import dropbox
from dropbox.exceptions import ApiError

from PyPDF2 import PdfReader

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from src.config.config import *

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
    
# ─────────────────────────────────────────────────────────────────────────────
# CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

@st.cache_resource(show_spinner=False)
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

    # Normalizamos: tuplas -> dicts
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

    # Cargar índice existente o crear uno nuevo
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

    # Marcamos "borrados" y "modificados" como no activos (por si luego quieres filtrarlos)
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

    # Reindexar SOLO nuevos + modificados
    # (los borrados simplemente ya no se reindexan)
    index_ids = list(new_ids) + list(modified_ids)
    for fid in index_ids:
        f = current_map[fid]
        name = f["name"]
        path_lower = f["path_lower"]
        mime = f["mimeType"]
        if mime not in ("application/pdf", "text/plain", "text/markdown"): 
            continue
        txt = dropbox_read_text(dbx, file_id=fid, path_lower=path_lower, mime=mime)
        if not txt: 
            continue
        base = Document(
            page_content=txt,
            metadata={"source":"dropbox","id":fid,"path_lower":path_lower,"title":name,"mimeType":mime}
        )
        chunks = splitter.split_documents([base])
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
    print(f"💾 (Dropbox) Índice guardado en {persist_path}")
    return vectordb

def construir_vectorstore_dropbox(dbx):
    files = dropbox_list_files(dbx, DROPBOX_ROOT or "")
    files_small = [{"id": f.id, "name": f.name, "path_lower": f.path_lower, "mimeType": guess_mime_from_name(f.name)} for f in files]
    files_serializable = tuple(tuple(sorted(d.items())) for d in files_small)
    return construir_vectorstore_dropbox_cached(files_serializable, dbx._oauth2_access_token)