#!/usr/bin/env bash
set -euo pipefail

REQUIRED_FILES=(
  "./secrets/client_secret.json"
  "./secrets/client_secret_website.json"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: required file not found: $f" >&2
    exit 1
  fi
done

docker compose up --build