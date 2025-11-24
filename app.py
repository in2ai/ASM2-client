# app.py
# ─────────────────────────────────────────────────────────────────────────────
# RAG sobre Google Drive ,Dropbox y One Drive con ACL:
# - El índice puede crearlo un “superusuario”.
# - Cada consulta se valida con las credenciales del usuario actual (Drive/Dropbox).
# - Drive guarda ACL (permissionIds/domains/anyone) y valida en vivo.
# - Dropbox valida en vivo con el token del usuario conectado.
# - Selector para preguntar a Drive, Dropbox o ambos.
# ─────────────────────────────────────────────────────────────────────────────

# Main imports
import os

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import SystemMessage, HumanMessage

import streamlit as st

# Config
from src.config.config import *

# Connectors
from src.connectors.drive import drive_can_read, get_current_user_drive, oauth_login_drive, construir_vectorstore_drive
from src.connectors.dropbox import dropbox_can_read, oauth_dropbox, construir_vectorstore_dropbox
from src.connectors.onedrive import onedrive_can_read, onedrive_device_login, construir_vectorstore_onedrive
from src.utils.helpers import cosine_dist

# Metrics
from src.metrics.metrics import Metrics, TimedMetric, insert_metric, register_user_activity

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
# RESPONDER (multi-origen)
# ─────────────────────────────────────────────────────────────────────────────

def responder_multi(query, vectordbs, services, threshold=0.50, k=6, chunk_chars=1600):
    """
    vectordbs: lista de tuplas (source, vectordb) con source en {"drive","dropbox"}.
    services: dict {'drive': service_drive, 'dropbox': dbx}
    """
    # Register that the user is still active
    register_user_activity()

    emb = OpenAIEmbeddings(model="text-embedding-3-small")
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

    allowed_chunks = []

    # 1) Recuperar candidatos de cada origen y filtrar por permisos
    insert_metric(Metrics.NUM_RAG_TOKENS_IN.value, llm.get_num_tokens(query))

    with TimedMetric(Metrics.DOC_RESPONSE_TIME.value):
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

    insert_metric(Metrics.NUM_DOCS_RAG.value, len(allowed_chunks))

    # 2) Re-ranking por similitud semántica
    q_vec = emb.embed_query(query)
    texts = [(d.page_content or "")[:chunk_chars] for d in allowed_chunks]
    d_vecs = emb.embed_documents(texts)
    paired = list(zip(allowed_chunks, [cosine_dist(q_vec, dv) for dv in d_vecs]))
    paired.sort(key=lambda x: x[1], reverse=True)

    picked = [d for d, s in paired if s >= float(threshold)][:k] or [d for d, s in paired[:k]]

    insert_metric(Metrics.NUM_DOCS_LLM.value, len(picked))
    insert_metric(Metrics.RELEVANT_DOC_RATE.value, len(picked) / len(allowed_chunks))

    # 3) Contexto
    def cite(d):
        src = d.metadata.get("source","drive")
        tag = "Drive" if src == "drive" else "Dropbox"
        t = d.metadata.get("title","(sin título)")
        return f"[{tag}:{t}] {(d.page_content or '')[:chunk_chars]}"
    contexto = "\n\n".join(cite(d) for d in picked)

    insert_metric(Metrics.NUM_RAG_TOKENS_OUT.value, llm.get_num_tokens(contexto))

    # 4) LLM
    system = ("Eres un asistente RAG en ESPAÑOL. Responde SOLO con el CONTEXTO. "
              "Redacta en lenguaje natural, claro y directo. Cita los títulos entre corchetes.")
    user = f"CONTEXTO:\n{contexto}\n\nPREGUNTA:\n{query}"

    insert_metric(Metrics.NUM_LLM_TOKENS_IN.value, llm.get_num_tokens(user))

    with TimedMetric(Metrics.LLM_RESPONSE_TIME.value):
        ans = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content

    insert_metric(Metrics.NUM_LLM_TOKENS_OUT.value, llm.get_num_tokens(ans))

    if not ans or not ans.strip():
        t = picked[0].metadata.get("title", "(sin título)")
        ans = f"Según [{t}]: {(picked[0].page_content or '')[:chunk_chars]}"
    return ans

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

# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR (sesiones y fuentes)
# ─────────────────────────────────────────────────────────────────────────────

with st.sidebar:
    if os.path.exists(LOGO_IN2AI): st.image(LOGO_IN2AI, width=140)
    if os.path.exists(LOGO_IGAPE): st.image(LOGO_IGAPE, width=140)

    st.markdown("### 🔐 Google Drive")

    # Detecta si venimos de Google con ?code=... o si ya iniciamos el flujo
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
                # Llamada inicial que muestra la URL de autorización y hace st.stop()
                oauth_login_drive()
            st.info("Pulsa **Conectar con Google Drive** para empezar.")
    else:
        if st.button("Cerrar sesión Drive", use_container_width=True):
            for k in ("service","vectordb","drive_live_check","oauth_state"):
                st.session_state.pop(k, None)
            try: st.cache_resource.clear()
            except Exception: pass
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

st.title("ACM2 - RAG con ACL (Drive + Dropbox)")

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
