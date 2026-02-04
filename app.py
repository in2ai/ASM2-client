# app.py
# ─────────────────────────────────────────────────────────────────────────────
# Asistente Conversacional Multisectorial Multiempresa (ASM2)
# - El índice puede crearlo un “superusuario”.
# - Cada consulta se valida con las credenciales del usuario actual (Drive/Dropbox).
# - Drive guarda ACL (permissionIds/domains/anyone) y valida en vivo.
# - Dropbox valida en vivo con el token del usuario conectado.
# - Selector para preguntar a Drive, Dropbox o ambos.
# ─────────────────────────────────────────────────────────────────────────────

# Main imports
import base64
import os
import threading
import time
from typing import List, Optional

import streamlit as st
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

# Reranker
from sentence_transformers import CrossEncoder

# Config
from src.config.config import *

# Connectors
from src.connectors.drive import (
    construir_vectorstore_drive,
    drive_can_read,
    get_current_user_drive,
    oauth_login_drive,
)
from src.connectors.dropbox import (
    construir_vectorstore_dropbox,
    dropbox_can_read,
    oauth_dropbox,
)
from src.connectors.onedrive import (
    construir_vectorstore_onedrive,
    onedrive_can_read,
    onedrive_device_login,
)
from src.connectors.search import hybrid_search
from src.connectors.store import EMBEDDINGS, QDRANT_PATH, extract_topics

# Metrics
from src.metrics.metrics import (
    Metrics,
    TimedMetric,
    insert_metric,
    register_topics,
    register_user_activity,
    register_words,
)

# Utils
from src.utils.nlp import detect_language, extract_search_terms, init_nlp
from src.utils.topic import resolve_topic_names

# Inicializar recursos NLP al arrancar la app
init_nlp()

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def load_image_base64(path: str) -> Optional[str]:
    """
    Carga una imagen y la devuelve como string base64.
    Retorna None si el archivo no existe o hay error al leerlo.
    """
    try:
        if os.path.exists(path):
            with open(path, "rb") as f:
                return base64.b64encode(f.read()).decode()
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models for structured LLM output
# ─────────────────────────────────────────────────────────────────────────────


class Source(BaseModel):
    """A source document cited in the response."""

    title: str = Field(description="The title or filename of the source document")
    source_type: str = Field(
        description="The type of source: 'Drive', 'Dropbox', or 'OneDrive'"
    )
    link: Optional[str] = Field(
        default=None,
        description="The webViewLink URL to the document (only available for Drive)",
    )


class RAGResponse(BaseModel):
    """Structured response from the RAG system."""

    answer: str = Field(
        description="The answer to the user's question based on the context provided"
    )
    sources: List[Source] = Field(
        description="List of the relevant sources used to craft the answer"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Hardware usage metrics
# ─────────────────────────────────────────────────────────────────────────────


def extract_usage_metrics():
    import GPUtil
    import psutil

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
# RERANKER (Cross-Encoder para reordenar resultados de búsqueda)
# ─────────────────────────────────────────────────────────────────────────────

# Modelo anterior (más preciso pero más lento, ~560M params):
# RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"


# Modelo multilingüe ligero (~117M params, soporta ES y 13 idiomas más):
RERANKER_MODEL = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"


@st.cache_resource(show_spinner=False)
def get_reranker():
    """Carga el modelo de reranking (cross-encoder)."""
    # print(f"🔄 Cargando modelo de reranking: {RERANKER_MODEL}")
    return CrossEncoder(RERANKER_MODEL)


def rerank_documents(query: str, documents: list, top_k: int = None) -> list:
    """
    Reordena documentos usando un cross-encoder para mejor precisión.

    Args:
        query: La query del usuario
        documents: Lista de documentos (LangChain Document objects)
        top_k: Número máximo de documentos a retornar (None = todos)

    Returns:
        Lista de documentos reordenados por relevancia
    """
    if not documents:
        return documents

    global _reranker

    # Preparar tuplas (query, documento) para el cross-encoder
    pairs = [(query, doc.page_content) for doc in documents]

    # Obtener scores del cross-encoder
    scores = _reranker.predict(pairs)
    print(f"DEBUG Raw scores: {scores}")

    # Combinar documentos con scores y ordenar por score descendente
    scored_docs = list(zip(documents, scores))
    scored_docs.sort(key=lambda x: x[1], reverse=True)

    # Extraer documentos ordenados
    reranked_docs = [doc for doc, score in scored_docs]

    if top_k is not None:
        reranked_docs = reranked_docs[:top_k]

    return reranked_docs


# ─────────────────────────────────────────────────────────────────────────────
# REFORMATEADOR DE CONSULTAS (con memoria conversacional)
# ─────────────────────────────────────────────────────────────────────────────


def rewrite_query_with_context(query: str, history: list) -> str:
    """
    Reescribe la query para clarificar pronombres y referencias usando el historial de conversación.
    """
    if not history or len(history) < 2:
        return query

    # Get the last 4 messages as context
    recent = history[-4:]
    history_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content'][:300]}"
        for m in recent
    )

    rewriter_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    prompt = f"""Given this conversation history:
{history_text}

Your task: If the following query contains ambiguous pronouns or references (like "it", "that document", "the same", "more about that"), rewrite it to be self-contained.
If the query is already clear and self-contained, return it as is.


Original query: {query}

Respond ONLY with the rewritten query, without explanations:"""

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


def preparar_contexto_rag(query, vectordb, services, k=6, chunk_chars=1600):
    """
    Prepara el contexto RAG: busca documentos, filtra por permisos, reordena.
    Retorna (messages, available_sources, allowed_chunks) o None si no hay resultados.
    """
    # Register that the user is still active
    register_user_activity()

    # Detectar idioma
    lang_code = detect_language(query)
    print("IDIOMA DETECTADO: ", lang_code)

    # Register search terms
    search_terms = extract_search_terms(query, lang_code)
    register_words(search_terms, lang_code)

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)

    allowed_chunks = []

    # 0) Reescribir consulta con historial conversacional (clarifica pronombres/referencias)
    history = st.session_state.get("messages", [])
    expanded_query = rewrite_query_with_context(query, history)
    print(f"DEBUG Reescrita: {expanded_query}")

    # 1) Obtener chunks usando búsqueda híbrida (BM25 + Vector)
    insert_metric(Metrics.NUM_RAG_TOKENS_IN.value, llm.get_num_tokens(expanded_query))

    with TimedMetric(Metrics.DOC_RESPONSE_TIME.value):
        drive_user = None
        if "drive" in services:
            drive_user = get_current_user_drive(services["drive"])

        search_results = hybrid_search(vectordb, expanded_query, k, 25)

        # 1.5) Filtrar por permisos
        for f in search_results:
            source = f.metadata["source"]

            if (
                source == "Drive"
                and "drive" in services
                and has_access(services["drive"], f.metadata, drive_user)
            ):
                allowed_chunks.append(f)

            elif (
                source == "Dropbox"
                and "dropbox" in services
                and has_access(services["dropbox"], f.metadata)
            ):
                allowed_chunks.append(f)

            elif (
                source == "Onedrive"
                and "onedrive_token" in services
                and has_access(services["onedrive_token"], f.metadata)
            ):
                allowed_chunks.append(f)

        # 2) Reranking
        if allowed_chunks:
            allowed_chunks = rerank_documents(expanded_query, allowed_chunks, top_k=k)
            print(f"🎯 Reranking aplicado: {len(allowed_chunks)} documentos")

    if not allowed_chunks:
        return None

    topic_indices = {
        t for d in allowed_chunks for t, _ in d.metadata.get("topics", {}).items()
    }
    topics_for_db = resolve_topic_names(topic_indices, "es", QDRANT_PATH)
    register_topics(topics_for_db)

    insert_metric(Metrics.NUM_DOCS_RAG.value, len(allowed_chunks))

    # 2) Contexto
    SOURCE_TAGS = {"Drive": "Drive", "Dropbox": "Dropbox", "Onedrive": "OneDrive"}

    def get_doc_info(d):
        """Extrae info común de un documento: tag, título y enlace."""
        src = d.metadata.get("source", "Drive")
        tag = SOURCE_TAGS.get(src, src)
        title = d.metadata.get("title") or d.metadata.get("name") or "(sin título)"
        link = d.metadata.get("webViewLink")
        return tag, title, link

    def cite(d):
        tag, title, link = get_doc_info(d)
        link_info = f" (Link: {link})" if link else ""
        return f"[{tag}:{title}{link_info}] {(d.page_content or '')[:chunk_chars]}"

    # Construir lista de fuentes disponibles para el LLM
    available_sources = []
    seen_ids = set()
    for d in allowed_chunks:
        doc_id = d.metadata.get("id")
        if doc_id not in seen_ids:
            seen_ids.add(doc_id)
            tag, title, link = get_doc_info(d)
            available_sources.append({"title": title, "source_type": tag, "link": link})

    contexto = "\n\n".join(cite(d) for d in allowed_chunks)
    print(contexto)

    insert_metric(Metrics.NUM_RAG_TOKENS_OUT.value, llm.get_num_tokens(contexto))

    # 3) Preparar mensajes para el LLM
    system = (
        "You are a RAG conversational assistant. Respond ONLY with the provided CONTEXT. "
        "Respond EXCLUSIVELY in the language of the last message of the user, "
        f"which has been detected to have the following language code: {lang_code}. "
        "Do not improvise if you don't have information in the context. "
        'In your response, do not use the word "CONTEXT", instead use "the sources". '
        "Write in natural, clear, and direct language. "
        "IMPORTANT: In the 'sources' field, include ONLY the sources you actually used to respond. "
        "If the question is a greeting, thanks, or does not require information from the sources, leave 'sources' empty. "
        "Use the conversation history to follow the thread."
    )

    # Include links in the sources list so the LLM can return them
    sources_info = "\n".join(
        [
            f"- title: {s['title']}, type: {s['source_type']}, link: {s.get('link') or 'N/A'}"
            for s in available_sources
        ]
    )
    print(sources_info)

    # Build list of messages for the LLM from st.session_state.messages
    messages = [SystemMessage(content=system)]
    for m in history[:-1][-10:]:  # Last 10 messages excluding current
        if m["role"] == "user":
            messages.append(HumanMessage(content=m["content"]))
        else:
            messages.append(AIMessage(content=m["content"]))

    user_message = f"""CONTEXT:
{contexto}

AVAILABLE SOURCES:
{sources_info}

QUESTION:
{query}"""

    messages.append(HumanMessage(content=user_message))

    insert_metric(Metrics.NUM_LLM_TOKENS_IN.value, llm.get_num_tokens(user_message))

    return messages, available_sources, allowed_chunks, lang_code


def responder_streaming(query, vectordb, services, placeholder, k=6, chunk_chars=1600):
    """
    Genera respuesta usando structured output para que el LLM seleccione las fuentes relevantes.
    Retorna la respuesta completa al final.
    """
    # Preparar contexto
    result = preparar_contexto_rag(query, vectordb, services, k, chunk_chars)

    if result is None:
        msg = "No hay contenido accesible relacionado con tu consulta en las fuentes seleccionadas."
        placeholder.markdown(
            f'<div class="chat-bubble-bot">{msg}</div>', unsafe_allow_html=True
        )
        return msg

    messages, available_sources, allowed_chunks, lang_code = result

    # LLM con structured output para que seleccione solo las fuentes que realmente usa
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    structured_llm = llm.with_structured_output(RAGResponse)

    with TimedMetric(Metrics.LLM_RESPONSE_TIME.value):
        response: RAGResponse = structured_llm.invoke(messages)

    print(f"DEBUG LLM response: {response}")
    full_response = response.answer

    if not full_response.strip():
        fallback_messages = {
            "es": "No encontré información relevante sobre ese tema en las fuentes disponibles.",
            "en": "I couldn't find relevant information about that topic in the available sources.",
            "gl": "Non atopei información relevante sobre ese tema nas fontes dispoñibles.",
        }
        full_response = fallback_messages.get(lang_code, fallback_messages["es"])

    insert_metric(Metrics.NUM_LLM_TOKENS_OUT.value, len(full_response.split()))

    # Añadir solo las fuentes que el LLM seleccionó (no todas las disponibles)
    if response.sources:
        sources_html = "<br><br><b>Fuentes:</b><ul>"
        for src in response.sources:
            if src.link:
                sources_html += f'<li><a href="{src.link}" target="_blank">{src.title}</a> ({src.source_type})</li>'
            else:
                sources_html += f"<li>{src.title} ({src.source_type})</li>"
        sources_html += "</ul>"
        full_response += sources_html

    # Renderizar respuesta final
    placeholder.markdown(
        f'<div class="chat-bubble-bot">{full_response}</div>', unsafe_allow_html=True
    )

    return full_response


# ─────────────────────────────────────────────────────────────────────────────
# ESTILOS
# ─────────────────────────────────────────────────────────────────────────────

st.markdown(
    """
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
section[data-testid="stSidebar"] .stButton>button { width:100%; max-width:240px; margin:0 auto; }
/* Footer fijo para logos de financiación */
.footer-financiacion {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    padding: 8px 20px;
    border-top: 1px solid #eaeaea;
    z-index: 998;
}
.footer-financiacion img { max-height: 50px; width: 100%; object-fit: contain; }
/* Asegurar que el chat input esté por encima del footer */
.main .block-container { padding-top: 1rem !important; padding-bottom: 55px !important; }
[data-testid="stBottom"] { padding-bottom: 55px !important; }
</style>
""",
    unsafe_allow_html=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# CARGA / CONSTRUCCIÓN ÍNDICES
# ─────────────────────────────────────────────────────────────────────────────


@st.cache_resource(show_spinner=False)
def get_vectordb():
    vectordb = None

    if "service" in st.session_state:
        with st.spinner("Construyendo / Cargando índice de Drive…"):
            vectordb = construir_vectorstore_drive()

    if "dbx" in st.session_state:
        with st.spinner(
            f"Construyendo / Cargando índice de Dropbox ({DROPBOX_ROOT or '/'})…"
        ):
            vectordb = construir_vectorstore_dropbox()

    if "onedrive_token" in st.session_state:
        try:
            with st.spinner(
                f"Construyendo / Cargando índice de OneDrive ({ONEDRIVE_ROOT or '/'})…"
            ):
                vectordb = construir_vectorstore_onedrive()
        except Exception as e:
            print(f"[OneDrive ERROR] {type(e).__name__}: {e}")
            st.error(f"❌ Error indexando OneDrive: {e}")

    # Extraer temas de chunks si es necesario
    if vectordb is not None:
        extract_topics(vectordb)

    return vectordb


get_vectordb()

# Pre-cargar el modelo de reranking durante el inicio de la app
_reranker = get_reranker()

# Pre-calentar el modelo de embeddings (primera llamada a OpenAI establece conexión)
EMBEDDINGS.embed_query("warmup")

# Ocultar el indicador de carga después de que todo esté listo
st.markdown(
    "<style>[data-testid='stStatusWidget'] { display: none !important; }</style>",
    unsafe_allow_html=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# SIDEBAR (sesiones y fuentes)
# ─────────────────────────────────────────────────────────────────────────────

with st.sidebar:
    # Logo In2AI en la parte superior del sidebar (centrado con HTML)
    logo_in2ai_data = load_image_base64(LOGO_IN2AI)
    if logo_in2ai_data:
        st.markdown(
            f'<div style="display:flex;justify-content:center;width:100%;padding:10px 0;">'
            f'<img src="data:image/png;base64,{logo_in2ai_data}" style="max-width:140px;">'
            f"</div>",
            unsafe_allow_html=True,
        )

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
            for k in ("service", "vectordb", "drive_live_check", "oauth_state"):
                st.session_state.pop(k, None)
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
                tok = onedrive_device_login()  # esta función muestra la UI y hace st.stop() hasta terminar o cancelar
                if tok:
                    st.session_state.onedrive_token = tok
                    st.session_state.pop("odc_auth_mode", None)
                    get_vectordb.clear()
                    st.rerun()
        else:
            if st.button("Desconectar OneDrive", use_container_width=True):
                for k in (
                    "onedrive_token",
                    "vectordb_onedrive",
                    "odc_auth_mode",
                    "od_flow",
                    "od_authority",
                ):
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
                st.caption(
                    f"Dropbox conectado como {acc.email} · Ruta efectiva: {root_effective}"
                )
            except Exception:
                pass
            st.rerun()

    if st.session_state.get("dbx"):
        if st.button("Desconectar Dropbox", use_container_width=True):
            for k in (
                "dbx",
                "vectordb_dropbox",
                "dbx_auth_mode",
                "dbx_auth_flow",
                "dbx_authorize_url",
            ):
                st.session_state.pop(k, None)
            st.success("Dropbox desconectado.")
            st.rerun()

    st.markdown("### ⚙️ Fuentes a consultar")

    options = []
    if st.session_state.get("service"):
        options.append("Drive")
    if st.session_state.get("dbx"):
        options.append("Dropbox")
    if st.session_state.get("onedrive_token"):  # ← añade OneDrive si hay token
        options.append("OneDrive")

    if options:
        sel = st.multiselect("Selecciona fuentes", options=options, default=options)
    else:
        st.info("Conecta al menos una fuente (Drive/Dropbox/OneDrive).")
        sel = []

    st.session_state.sources_selected = sel

    st.markdown("### 🔄 Reindexar contenidos")
    st.caption(
        "Pulsa para detectar e indexar nuevos ficheros en las fuentes conectadas."
    )

    if st.button("Reindexar ahora", use_container_width=True):
        reindex_all_sources()

# ─────────────────────────────────────────────────────────────────────────────
# UI PRINCIPAL (chat)
# ─────────────────────────────────────────────────────────────────────────────

st.markdown(
    '<h1 style="font-size: 1.6rem; margin-top: 0; margin-bottom: 0.5rem;">Asistente Conversacional Multisectorial Multiempresa (ASM2)</h1>',
    unsafe_allow_html=True,
)

# ─────────────────────────────────────────────────────────────────────────────
# FOOTER (logos de financiación - fijo en la parte inferior de la pantalla)
# Renderizado temprano para que siempre esté visible, incluso durante el spinner
# ─────────────────────────────────────────────────────────────────────────────

logo_financiacion_data = load_image_base64(LOGO_FINANCIACION)
if logo_financiacion_data:
    st.markdown(
        f'<div class="footer-financiacion"><img src="data:image/png;base64,{logo_financiacion_data}" alt="Logos de financiación"></div>',
        unsafe_allow_html=True,
    )

# Inicializar historial de mensajes
if "messages" not in st.session_state:
    st.session_state.messages = []

# Render historial
for m in st.session_state.messages:
    cls = "user" if m["role"] == "user" else "bot"
    bub = "chat-bubble-user" if m["role"] == "user" else "chat-bubble-bot"
    st.markdown(
        f'<div class="chat-row {cls}"><div class="{bub}">{m["content"]}</div></div>',
        unsafe_allow_html=True,
    )

prompt = st.chat_input("Escribe tu mensaje…")

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    st.markdown(
        f'<div class="chat-row user"><div class="chat-bubble-user">{prompt}</div></div>',
        unsafe_allow_html=True,
    )

    # Crear placeholder para streaming
    response_container = st.container()
    with response_container:
        st.markdown('<div class="chat-row bot">', unsafe_allow_html=True)
        response_placeholder = st.empty()

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
            response_placeholder.markdown(
                f'<div class="chat-bubble-bot">{ans}</div>', unsafe_allow_html=True
            )
        else:
            # Mostrar spinner mientras prepara el contexto, luego streaming
            with st.spinner("Pensando…"):
                ans = responder_streaming(
                    prompt, vectordb, services, response_placeholder, k=6
                )

    except Exception as e:
        ans = f"Error: {e}"
        response_placeholder.markdown(
            f'<div class="chat-bubble-bot">{ans}</div>', unsafe_allow_html=True
        )

    # Cerrar div del chat-row
    with response_container:
        st.markdown("</div>", unsafe_allow_html=True)

    # Guardar en historial
    st.session_state.messages.append({"role": "assistant", "content": ans})
