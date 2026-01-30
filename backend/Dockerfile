FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    locales \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install fastapi pydantic uvicorn psycopg2-binary \
    chardet requests beautifulsoup4 python-docx dropbox openpyxl \
    python-pptx PyPDF2 google-api-python-client numpy dotenv \
    qdrant-client fasttext nltk stanza huggingface-hub \
    langchain==0.3.25 langchain-community==0.3.24 langchain-openai==0.3.19 langchain-text-splitters==0.3.8 \
    igraph

WORKDIR /app

COPY requirements.txt requirements.txt
COPY server.py server.py
COPY src src

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]