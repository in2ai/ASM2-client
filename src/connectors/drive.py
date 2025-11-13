import os, io, time, json, datetime

import faiss
import streamlit as st

from PyPDF2 import PdfReader

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import Flow

from google.oauth2.credentials import Credentials

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from src.config.config import *
from src.utils.helpers import safe_execute

# ─────────────────────────────────────────────────────────────────────────────
# GOOGLE DRIVE
# ─────────────────────────────────────────────────────────────────────────────

def oauth_login_drive():
    """
    Web OAuth para Drive (robusto en Streamlit + Docker):
    - Si vuelve ?code=..., se intercambia aunque se haya perdido session_state.
    - Usa los scopes EXACTOS devueltos en la URL (?scope=...) para evitar
      "Scope has changed...".
    - Si aún no hay code, muestra la URL de autorización.
    - Tras éxito: guarda service en sesión, limpia la URL y devuelve service.
    """
    if not os.path.exists(CLIENT_SECRET_FILE):
        st.error(f"❌ No existe {CLIENT_SECRET_FILE}. Revisa el client web en Google Cloud.")
        st.stop()
    if not REDIRECT_URI:
        st.error("❌ Falta REDIRECT_URI en .env (debe coincidir EXACTAMENTE con la registrada).")
        st.stop()

    # ---------- Helpers (definidos DENTRO para que siempre existan) ----------
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

    # 1) Si ya tenemos ?code=..., intercambiar de inmediato (scope exacto)
    if incoming_code:
        try:
            flow = Flow.from_client_secrets_file(
                CLIENT_SECRET_FILE,
                scopes=scopes_callback or SCOPES,   # ← usa los scopes de retorno si vienen
                redirect_uri=REDIRECT_URI,
            )
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
            st.error(f"Error de Google API: {e}"); st.stop()
        except Exception as e:
            st.error(f"Error en Web OAuth (intercambiando code): {e}"); st.stop()

    # 2) Sin code → inicia autorización y muestra URL
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
        st.info("Tras autorizar, Google te devolverá aquí con ?code=… y seguiremos automáticamente.")
        st.stop()

    except HttpError as e:
        st.error(f"Error de Google API: {e}"); st.stop()
    except Exception as e:
        st.error(f"Error iniciando Web OAuth: {e}"); st.stop()


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
# CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

@st.cache_resource(show_spinner=False)
def construir_vectorstore_drive_cached(files_serializable, creds_dict, batch_size=200, persist_path="faiss_index"):
    def load_manifest(path):
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"processed_ids": [], "total_chunks": 0, "completed": False, "started_at": datetime.now().isoformat()}

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
    was_completed = bool(state.get("completed", False))

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = None
    try:
        vectorstore = FAISS.load_local(persist_path, embeddings, allow_dangerous_deserialization=True)
        print(f"📂 (Drive) Cargando índice desde {persist_path}")
        if was_completed:
            print("✅ Índice ya completo. Usando caché.")
            return vectorstore
    except Exception:
        pass

    if vectorstore is None:
        index = faiss.IndexFlatL2(1536)
        vectorstore = FAISS(embedding_function=embeddings, index=index, docstore=InMemoryDocstore({}), index_to_docstore_id={})

    service = build("drive", "v3", credentials=Credentials.from_authorized_user_info(creds_dict))
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

    files_serializable = [dict(t) if not isinstance(t, dict) else t for t in files_serializable]
    remaining_files = [f for f in files_serializable if f["id"] not in processed_ids]

    docs_batch, pending_ids = [], []

    def flush(reason="batch"):
        nonlocal docs_batch, pending_ids, total_chunks, state
        if not docs_batch: return
        vectorstore.add_documents(docs_batch)
        total_chunks += len(docs_batch)
        vectorstore.save_local(persist_path)
        for fid in pending_ids: processed_ids.add(fid)
        state.update({"processed_ids": list(processed_ids), "total_chunks": total_chunks, "completed": False})
        save_manifest(manifest_path, state)
        print(f"🧩 (Drive) Persistidos {len(docs_batch)} chunks [{reason}]")
        docs_batch, pending_ids = [], []

    for idx, f in enumerate(files_serializable):
        if f["id"] in processed_ids: continue
        txt = extraer_texto_drive(service, f["id"], f["mimeType"])
        if not txt: continue
        acl = get_acl_drive(service, f["id"])
        base_doc = Document(
            page_content=txt,
            metadata={
                "source": "drive",
                "title": f["name"], "id": f["id"], "mimeType": f["mimeType"],
                "modifiedTime": f.get("modifiedTime"), "acl": acl
            }
        )
        chunks = splitter.split_documents([base_doc])
        docs_batch.extend(chunks); pending_ids.append(f["id"])
        if len(docs_batch) >= batch_size: flush("lote")

    if docs_batch: flush("final")
    if not processed_ids and total_chunks == 0: raise RuntimeError("No se encontraron documentos legibles (Drive).")
    state["completed"] = True; save_manifest(manifest_path, state)
    print(f"💾 (Drive) Índice guardado en {persist_path}")
    return vectorstore

def construir_vectorstore_drive(service):
    files = [f for f in listar_bfs_drive(service, FOLDER_ID) if f["mimeType"] in (
        "application/pdf", "application/vnd.google-apps.document", "text/plain", "text/markdown"
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