#!/bin/sh
# Entrypoint for the Ollama server container.
#
#   1. Starts `ollama serve`.
#   2. Waits for the API to come up.
#   3. Pulls a model selected via env vars (see docker-compose.yml / .env.example).
#   4. Hands off to the server process, forwarding shutdown signals cleanly.

set -e

cleanup() {
  echo "[entrypoint] Caught stop signal, shutting down Ollama server..."
  kill -TERM "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  exit 0
}
trap cleanup TERM INT

echo "[entrypoint] Starting Ollama server..."
ollama serve &
SERVER_PID=$!

echo "[entrypoint] Waiting for the server to become ready..."
i=0
until ollama list >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[entrypoint] ERROR: server did not become ready after 60s" >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] Server is ready."

# Resolve which model to pull:
#   1. LOCAL_HF_MODEL (+ optional LOCAL_HF_MODEL_QUANT) -> hf.co/<LOCAL_HF_MODEL>[:<LOCAL_HF_MODEL_QUANT>]
#   2. OLLAMA_MODEL                   -> used as-is (library model, or your own full reference)
MODEL_REF=""
if [ -n "$LOCAL_HF_MODEL" ]; then
  MODEL_REF="hf.co/${LOCAL_HF_MODEL}"
  if [ -n "$LOCAL_HF_MODEL_QUANT" ]; then
    MODEL_REF="${MODEL_REF}:${LOCAL_HF_MODEL_QUANT}"
  fi
elif [ -n "$OLLAMA_MODEL" ]; then
  MODEL_REF="$OLLAMA_MODEL"
fi

if [ -n "$MODEL_REF" ]; then
  echo "[entrypoint] Pulling model: $MODEL_REF"
  if ! ollama pull "$MODEL_REF"; then
    echo "[entrypoint] WARNING: failed to pull '$MODEL_REF'. The server is still up. Common causes:"
    echo "[entrypoint]   - the repo has no GGUF file (Ollama needs GGUF, not raw safetensors)"
    echo "[entrypoint]   - a bad LOCAL_HF_MODEL_QUANT tag - check the repo's 'Files and versions' tab on Hugging Face for valid quant names"
    echo "[entrypoint]   - a 'realm host' error - try huggingface.co/... instead of hf.co/... for LOCAL_HF_MODEL"
    echo "[entrypoint]   - a gated/private repo - see README.md for linking your Ollama SSH key to Hugging Face"
  fi
else
  echo "[entrypoint] No LOCAL_HF_MODEL or OLLAMA_MODEL set - skipping model pull."
  echo "[entrypoint] Pull one manually any time: docker exec <container> ollama pull <model>"
fi

wait "$SERVER_PID"