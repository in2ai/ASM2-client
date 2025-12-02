import requests
import msal
import io
import json
import os

import faiss
import streamlit as st
from PyPDF2 import PdfReader

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from src.config.config import *

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
    keep = ("application/pdf", "text/plain", "text/markdown")
    return [f for f in files if (f["mimeType"] in keep or f["name"].lower().endswith((".pdf",".txt",".md")))]


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
# CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

@st.cache_resource(show_spinner=False)
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
        vectordb = FAISS(embedding_function=embeddings, index=index, docstore=InMemoryDocstore({}), index_to_docstore_id={})
        print(f"🆕 (OneDrive) Creando índice nuevo en {persist_path}")

    # Marcamos "borrados" y "modificados" como no activos (por si luego quieres filtrarlos)
    for fid in deleted_ids | modified_ids:
        info = files_state.get(fid, {})
        info["active"] = False
        files_state[fid] = info

    # Si no hay nada que reindexar, solo guardamos estado
    if not new_ids and not modified_ids:
        state["files"] = files_state
        save_manifest(manifest_path, state)
        print("✅ Índice de OneDrive sincronizado (sin nuevos embeddings).")
        try:
            st.success("✅ OneDrive indexado: sin cambios.")
        except Exception:
            pass
        return vectordb

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

    docs_batch = []
    printed = 0

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

        # 👇 Log UI + consola de cada documento (no bloquea si no hay contexto Streamlit)
        try:
            st.write(f"• Indexando **{name}** ({mime}) …")
        except Exception:
            pass
        print(f"(OneDrive) Indexando: {name} [{mime}] id={fid}")

        txt  = onedrive_download(token_dict, fid, mime_hint=mime)
        if not txt:
            try:
                st.warning(f"Saltado: {name} (vacío o no legible)")
            except Exception:
                pass
            continue

        base = Document(page_content=txt, metadata={"source":"onedrive","id":fid,"title":name,"mimeType":mime})
        chunks = splitter.split_documents([base])
        docs_batch.extend(chunks)
        printed += 1

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
    print(f"💾 (OneDrive) Índice guardado en {persist_path}")
    try:
        st.success(f"✅ OneDrive indexado: {printed} archivos.")
    except Exception:
        pass
    return vectordb


def construir_vectorstore_onedrive(token_dict):
    files = onedrive_list_files(token_dict, ONEDRIVE_ROOT or "")
    files_small = [{"id": f["id"], "name": f["name"], "mimeType": f.get("mimeType", "")} for f in files]
    files_serializable = tuple(tuple(sorted(d.items())) for d in files_small)
    return construir_vectorstore_onedrive_cached(files_serializable, token_dict)