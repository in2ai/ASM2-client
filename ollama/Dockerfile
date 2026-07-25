# Ollama server with a built-in OpenAI-compatible API, plus an entrypoint that
# pulls whatever model you select via env vars (including models from Hugging Face).
# See docker-compose.yml and .env.example for how model selection works.

ARG OLLAMA_IMAGE_TAG=latest
FROM ollama/ollama:${OLLAMA_IMAGE_TAG}

# Bind the server to all interfaces so it's reachable from outside the container
ENV OLLAMA_HOST=0.0.0.0:11434

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 11434

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]