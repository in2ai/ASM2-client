# syntax=docker/dockerfile:1
FROM python:3.10-slim

# Paquetes base + locales (para es_ES.UTF-8) y compilación básica
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    locales \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Generar locales (es_ES.UTF-8)
RUN sed -i 's/^# *\(es_ES.UTF-8 UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen es_ES.UTF-8
ENV LANG=es_ES.UTF-8 \
    LANGUAGE=es_ES:es \
    LC_ALL=es_ES.UTF-8 \
    TZ=Europe/Madrid

# Buenas prácticas Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Directorio compartido para modelos (evita que root y appuser usen cachés distintos)
ENV SENTENCE_TRANSFORMERS_HOME=/app/models \
    HF_HOME=/app/models \
    STANZA_RESOURCES_DIR=/app/models/stanza

# Config por defecto Streamlit (puedes sobreescribir por env)
ENV STREAMLIT_SERVER_HEADLESS=true \
    STREAMLIT_SERVER_ENABLECORS=false \
    STREAMLIT_SERVER_ENABLEXsSRFPROTECTION=false \
    STREAMLIT_SERVER_ADDRESS=0.0.0.0 \
    STREAMLIT_SERVER_PORT=8501

# Usuario no root
RUN useradd -m appuser
WORKDIR /app

# Copiamos SOLO requirements para cachear instalación
COPY requirements.txt /app/requirements.txt

# Añadimos streamlit si falta en requirements.txt
RUN if ! grep -qi '^streamlit' requirements.txt; then echo 'streamlit' >> requirements.txt; fi

# Instalar deps Python
RUN pip install --no-cache-dir -r requirements.txt

# Crear directorio de modelos y descargar todos los modelos
RUN mkdir -p /app/models/stanza && \
    python -c "import stanza; \
        stanza.download('es', package='ancora', processors='tokenize,mwt,pos,lemma'); \
        stanza.download('en', processors='tokenize,mwt,pos,lemma'); \
        stanza.download('gl', package='ctg', processors='tokenize,mwt,pos,lemma')" && \
    python -c "from huggingface_hub import hf_hub_download; \
        hf_hub_download(repo_id='cis-lmu/glotlid', filename='model.bin')" && \
    python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/mmarco-mMiniLMv2-L12-H384-v1')" && \
    chmod -R 755 /app/models

# Copiamos el resto del proyecto
RUN mkdir src
RUN mkdir img
COPY app.py /app/src
COPY src /app/src
COPY img /app/img

# No incluimos secretos en la imagen; se montarán como volumen
# (client_secret.json, client_secret_website.json, .env, qdrant_index/...)

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8501

# Lanza la app
CMD ["sh", "-c", "streamlit run app.py --server.port ${STREAMLIT_SERVER_PORT:-8501} --server.address 0.0.0.0"]
