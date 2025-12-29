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

# Directorio compartido para modelos de sentence-transformers
# (evita que root y appuser usen cachés distintos)
ENV SENTENCE_TRANSFORMERS_HOME=/app/models \
    HF_HOME=/app/models

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

# Descargar modelo de spacy
RUN python -m spacy download es_core_news_md

# Crear directorio de modelos y pre-descargar modelo de reranking
# chmod 755 asegura que cualquier usuario pueda leer los modelos (necesario para user: "${UID}:${GID}" en docker-compose)
# Modelos anterior:
#   - BAAI/bge-reranker-v2-m3 (multilingüe, ~560M params, más lento)
RUN mkdir -p /app/models && \
    python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/mmarco-mMiniLMv2-L12-H384-v1')" && \
    chmod -R 755 /app/models

# Copiamos el resto del proyecto
RUN mkdir src
RUN mkdir img
COPY app.py /app/src
COPY src /app/src
COPY img /app/img

# No incluimos secretos en la imagen; se montarán como volumen
# (client_secret.json, client_secret_website.json, .env, faiss_index/...)

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8501

# Lanza la app
CMD ["sh", "-c", "streamlit run app.py --server.port ${STREAMLIT_SERVER_PORT:-8501} --server.address 0.0.0.0"]
