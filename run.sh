#!/usr/bin/env bash
set -euo pipefail

REQUIRED_FILES=(
  "./secrets/client_secret.json"
)

usage() {
  cat <<'EOF'
Usage: ./run.sh [up|down|build|config|logs|ps] [options] [-- extra docker compose args]

Modes:
  --local           Include local QuestDB and Logto services (default)
  --remote          Use external QuestDB and Logto services

Accelerators:
  --gpu             Enable NVIDIA GPU for the backend service
  --qdrant cpu      Use CPU Qdrant (default)
  --qdrant nvidia   Enable NVIDIA GPU Qdrant image
  --qdrant amd      Enable AMD GPU Qdrant image

Common flags:
  -d, --detach      Run docker compose up in detached mode
  --no-build        Skip --build for docker compose up
  -h, --help        Show this help

Examples:
  ./run.sh up
  ./run.sh up --remote
  ./run.sh up --gpu --qdrant nvidia
  ./run.sh up --remote --gpu
  ./run.sh config --gpu
EOF
}

ensure_required_files() {
  local file
  for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
      echo "ERROR: required file not found: $file" >&2
      exit 1
    fi
  done
}

action="up"
mode="local"
backend_gpu=0
qdrant_accelerator="cpu"
detach=0
build_on_up=1
extra_args=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    up|down|build|config|logs|ps)
      action="$1"
      shift
      ;;
    --local)
      mode="local"
      shift
      ;;
    --remote)
      mode="remote"
      shift
      ;;
    --gpu)
      backend_gpu=1
      shift
      ;;
    --qdrant)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: --qdrant requires one of: cpu, nvidia, amd" >&2
        exit 1
      fi
      qdrant_accelerator="$2"
      shift 2
      ;;
    -d|--detach)
      detach=1
      shift
      ;;
    --no-build)
      build_on_up=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      extra_args+=("$@")
      break
      ;;
    *)
      extra_args+=("$1")
      shift
      ;;
  esac
done

case "$qdrant_accelerator" in
  cpu|nvidia|amd)
    ;;
  *)
    echo "ERROR: unsupported Qdrant accelerator '$qdrant_accelerator'" >&2
    exit 1
    ;;
esac

if [ "$action" = "up" ]; then
  ensure_required_files
fi

compose_args=(-f docker-compose.yml)

if [ "$mode" = "local" ]; then
  compose_args+=(-f docker-compose.local.yml)
fi

if [ "$backend_gpu" -eq 1 ]; then
  compose_args+=(-f docker-compose.gpu.yml)
fi

case "$qdrant_accelerator" in
  nvidia)
    compose_args+=(-f docker-compose.qdrant-nvidia.yml)
    ;;
  amd)
    compose_args+=(-f docker-compose.qdrant-amd.yml)
    ;;
esac

cmd=(docker compose "${compose_args[@]}" "$action")

if [ "$action" = "up" ]; then
  if [ "$build_on_up" -eq 1 ]; then
    cmd+=(--build)
  fi
  if [ "$detach" -eq 1 ]; then
    cmd+=(-d)
  fi
fi

if [ "${#extra_args[@]}" -gt 0 ]; then
  cmd+=("${extra_args[@]}")
fi

printf 'Running:'
printf ' %q' "${cmd[@]}"
printf '\n'

exec "${cmd[@]}"