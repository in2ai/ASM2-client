# 1) Construir
`docker build -t mi-streamlit .`

# 2a) Ejecutar sin compose
```
docker run --rm -p 8501:8501 \
  --env-file .env \
  -v "$PWD/faiss_index:/app/faiss_index" \
  -v "$PWD/secrets/client_secret.json:/app/client_secret.json:ro" \
  -v "$PWD/secrets/client_secret_website.json:/app/client_secret_website.json:ro" \
  mi-streamlit
```

# 2b) Con docker-compose
`docker compose up --build`

# 2c) Con `run.sh` (recomendado)
> Requiere Linux o una consola compatible
`./run.sh`

