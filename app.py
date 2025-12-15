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
import threading
import time

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

import streamlit as st

# Config
from src.config.config import *

# Connectors
from src.connectors.drive import drive_can_read, get_current_user_drive, oauth_login_drive, construir_vectorstore_drive
from src.connectors.dropbox import dropbox_can_read, oauth_dropbox, construir_vectorstore_dropbox
from src.connectors.onedrive import onedrive_can_read, onedrive_device_login, construir_vectorstore_onedrive

# Metrics
from src.metrics.metrics import Metrics, TimedMetric, insert_metric, register_user_activity, register_words

# Utils
from src.utils.nlp import extract_search_terms

# ─────────────────────────────────────────────────────────────────────────────
# Hardware usage metrics
# ─────────────────────────────────────────────────────────────────────────────

def extract_usage_metrics():
    import psutil, GPUtil
    
    while True:
        # CPU
        cpu_usage = psutil.cpu_percent(interval=1)
        insert_metric(Metrics.CPU_USAGE.value, cpu_usage)

        # RAM
        mem = psutil.virtual_memory()
        insert_metric(Metrics.RAM_USAGE.value, mem.percent)

        # GPU (if available)
        gpus = GPUtil.getGPUs()
    
        if len(gpus) > 0:
            insert_metric(Metrics.GPU_USAGE.value, gpus[0].load * 100)

        # Wait a little bit before pooling again
        time.sleep(30)


@st.cache_resource
def start_usage_metrics_thread():
    thread = threading.Thread(target=extract_usage_metrics, daemon=True)
    thread.start()


start_usage_metrics_thread()

# ─────────────────────────────────────────────────────────────────────────────
# REFORMATEADOR DE CONSULTAS (con memoria conversacional)
# ─────────────────────────────────────────────────────────────────────────────

def rewrite_query_with_context(query: str, history: list) -> str:
    """
    Reescribe la query para clarificar pronombres y referencias usando el historial de conversación.
    """
    if not history or len(history) < 2:
        return query
    
    # Coger los últimos 4 mensajes como contexto
    recent = history[-4:]
    history_text = "\n".join(
        f"{'Usuario' if m['role']=='user' else 'Asistente'}: {m['content'][:300]}"
        for m in recent
    )
    
    rewriter_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = f"""Dado este historial de conversación:
{history_text}

Tu tarea: Si la siguiente consulta contiene pronombres o referencias ambiguas (como "eso", "ese documento", "lo mismo", "más sobre eso"), reescríbela para que sea autocontenida.
Si la consulta ya es clara y autocontenida, devuélvela tal cual.

Consulta original: {query}

Responde SOLO con la consulta reescrita, sin explicaciones:"""
    
    try:
        rewritten = rewriter_llm.invoke([HumanMessage(content=prompt)]).content.strip()
        return rewritten if rewritten else query
    except Exception:
        return query

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
# REINDEXAR MANUALMENTE (botón)
# ─────────────────────────────────────────────────────────────────────────────

def reindex_all_sources():
    get_vectordb.clear()
    get_vectordb()

# ─────────────────────────────────────────────────────────────────────────────
# RESPONDER (multi-origen)
# ─────────────────────────────────────────────────────────────────────────────

def responder_multi(query, vectordb, services, threshold=0.50, k=6, chunk_chars=1600):
    # Register that the user is still active
    register_user_activity()

    # Register search terms
    search_terms = extract_search_terms(query)
    register_words(search_terms)

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

    allowed_chunks = []

    # 0) Reescribir consulta con historial conversacional (clarifica pronombres/referencias)
    history = st.session_state.get("messages", [])
    expanded_query = rewrite_query_with_context(query, history)

    # 1) Recuperar candidatos de cada origen y filtrar por permisos
    insert_metric(Metrics.NUM_RAG_TOKENS_IN.value, llm.get_num_tokens(expanded_query))

    with TimedMetric(Metrics.DOC_RESPONSE_TIME.value):
        if 'drive' in services:
            drive_user = get_current_user_drive(services["drive"])
        
        search = vectordb.similarity_search_with_score(expanded_query, k=256)

        for f, s in search:   
            source = f.metadata['source']

            if source == "Drive" and "drive" in services and has_access(services["drive"], f.metadata, drive_user):
                allowed_chunks.append(f)

            elif source == "Dropbox" and "dropbox" in services and has_access(services["dropbox"], f.metadata):
                allowed_chunks.append(f)

            elif source == "Onedrive" and "onedrive_token" in services and has_access(services["onedrive_token"], f.metadata):
                allowed_chunks.append(f)

            # We stop iterating when we have k docs or the score is too low
            if len(allowed_chunks) == k or s < threshold:
                break

    if not allowed_chunks:
        return "No hay contenido accesible relacionado con tu consulta en las fuentes seleccionadas."

    insert_metric(Metrics.NUM_DOCS_RAG.value, len(allowed_chunks))

    # 2) Contexto
    def cite(d):
        src = d.metadata.get("source","drive")
        tag = "Drive" if src == "drive" else "Dropbox"
        t = d.metadata.get("title","(sin título)")
        return f"[{tag}:{t}] {(d.page_content or '')[:chunk_chars]}"
    
    contexto = "\n\n".join(cite(d) for d in allowed_chunks)

    insert_metric(Metrics.NUM_RAG_TOKENS_OUT.value, llm.get_num_tokens(contexto))

    # 3) LLM con historial de conversación
    system = ("Eres un asistente conversacional RAG en ESPAÑOL. Responde SOLO con el CONTEXTO proporcionado. "
              "No improvises si no tienes información en el contexto. "
              "Redacta en lenguaje natural, claro y directo. Cita los títulos entre corchetes. "
              "Usa el historial de conversación para seguir el hilo.")
    
    # Construir lista de mensajes para el LLM desde st.session_state.messages
    messages = [SystemMessage(content=system)]
    for m in history[-10:]:  # Últimos 10 mensajes
        if m["role"] == "user":
            messages.append(HumanMessage(content=m["content"]))
        else:
            messages.append(AIMessage(content=m["content"]))
    messages.append(HumanMessage(content=f"CONTEXTO:\n{contexto}\n\nPREGUNTA:\n{query}"))

    insert_metric(Metrics.NUM_LLM_TOKENS_IN.value, llm.get_num_tokens(f"CONTEXTO:\n{contexto}\n\nPREGUNTA:\n{query}"))

    with TimedMetric(Metrics.LLM_RESPONSE_TIME.value):
        ans = llm.invoke(messages).content

    insert_metric(Metrics.NUM_LLM_TOKENS_OUT.value, llm.get_num_tokens(ans))

    if not ans or not ans.strip():
        t = allowed_chunks[0].metadata.get("title", "(sin título)")
        ans = f"Según [{t}]: {(allowed_chunks[0].page_content or '')[:chunk_chars]}"

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
# CARGA / CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────

@st.cache_resource
def get_vectordb():
    vectordb = None

    if "service" in st.session_state:
        with st.spinner("Construyendo / Cargando índice de Drive…"):
            vectordb = construir_vectorstore_drive()

    if "dbx" in st.session_state:
        with st.spinner(f"Construyendo / Cargando índice de Dropbox ({DROPBOX_ROOT or '/'})…"):
            vectordb = construir_vectorstore_dropbox()

    if "onedrive_token" in st.session_state:
        try:
            with st.spinner(f"Construyendo / Cargando índice de OneDrive ({ONEDRIVE_ROOT or '/'})…"):
                vectordb = construir_vectorstore_onedrive()
        except Exception as e:
            pass

    return vectordb

get_vectordb()

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
                get_vectordb.clear()
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
                    get_vectordb.clear()
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
            get_vectordb.clear()

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
    threshold = st.slider("Umbral (0.0 = permisivo · 0.90 = estricto)", 0.0, 0.90, 0.45, 0.01)
    st.session_state.threshold = threshold

    st.markdown("### 🔄 Reindexar contenidos")
    st.caption("Pulsa para detectar e indexar nuevos ficheros en las fuentes conectadas.")

    if st.button("Reindexar ahora", use_container_width=True):
        reindex_all_sources()

# ─────────────────────────────────────────────────────────────────────────────
# UI PRINCIPAL (chat)
# ─────────────────────────────────────────────────────────────────────────────

st.title("ASM2 - RAG con ACL (Drive + OneDrive + Dropbox)")

# Inicializar historial de mensajes
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
            # Add the connectors
            sel = st.session_state.get("sources_selected") or []                
            services = {}
            
            if "Drive" in sel and "service" in st.session_state:
                services["drive"] = st.session_state.service

            if "Dropbox" in sel and "dbx" in st.session_state:
                services["dropbox"] = st.session_state.dbx

            if "OneDrive" in sel and "onedrive_token" in st.session_state:
                services["onedrive_token"] = st.session_state.onedrive_token

            vectordb = get_vectordb()

            # Check the vector DB
            if vectordb is None:
                ans = "Conecta al menos una fuente (Drive/OneDrive/Dropbox) en la barra lateral."

            else:
                ans = responder_multi(
                    prompt, vectordb, services,
                    threshold=st.session_state.get("threshold", 0.45), k=6
                )

        except Exception as e:
            ans = f"Error: {e}"

    # Renderizar respuesta en UI
    st.markdown(f'<div class="chat-row bot"><div class="chat-bubble-bot">{ans}</div></div>', unsafe_allow_html=True)
    
    # Guardar en historial
    st.session_state.messages.append({"role": "assistant", "content": ans})
