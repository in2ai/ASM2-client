FROM python:3.10-slim

# Prepare environment
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    locales \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN sed -i 's/^# *\(es_ES.UTF-8 UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen es_ES.UTF-8

ENV LANG=es_ES.UTF-8 \
    LANGUAGE=es_ES:es \
    LC_ALL=es_ES.UTF-8 \
    TZ=Europe/Madrid

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ENV SENTENCE_TRANSFORMERS_HOME=/app/models \
    HF_HOME=/app/models \
    STANZA_RESOURCES_DIR=/app/models/stanza \
    NLTK_DATA=/app/models/nltk

WORKDIR /app

# Install python dependencies
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Download models
RUN mkdir -p /app/models/stanza /app/models/nltk && \
    python -c "import stanza; \
        stanza.download('es', package='ancora', processors='tokenize,mwt,pos,lemma'); \
        stanza.download('en', processors='tokenize,mwt,pos,lemma'); \
        stanza.download('gl', package='ctg', processors='tokenize,mwt,pos,lemma')" && \
    python -c "import os, nltk; nltk.download('stopwords', download_dir=os.environ['NLTK_DATA'])" && \
    python -c "from huggingface_hub import hf_hub_download; \
        hf_hub_download(repo_id='cis-lmu/glotlid', filename='model.bin')" && \
    python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/mmarco-mMiniLMv2-L12-H384-v1')" && \
    chmod -R 755 /app/models

# Copy project
COPY server.py server.py
COPY src src

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]