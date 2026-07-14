#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./run.sh [up|down|build|config|logs|ps] [options] [-- extra docker compose args]

Modes:
  --local           Include local TimescaleDB and Logto services (default)
  --remote          Use external TimescaleDB and Logto services
  --bench           Just like --local, but changes entrypoint to a benchmark instead of the web server

Networking:
  dashboard         Published on localhost:3001
  logto             Published on localhost:3011 and localhost:3002 in --local mode
  backend/qdrant    Internal Docker network only
  timescaledb       Internal Docker network only in --local mode

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
  ./run.sh up --bench
EOF
}

load_root_env() {
  if [ -f ./.env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
  fi
}

ensure_gdrive_oauth_client_config() {
  if [ -f "./secrets/client_secret.json" ]; then
    return 0
  fi
  if [ -n "${CLIENT_SECRET:-}" ]; then
    return 0
  fi
  echo "ERROR: Google Drive OAuth client config missing." >&2
  echo "Provide ./secrets/client_secret.json or set CLIENT_SECRET (e.g. in .env)." >&2
  exit 1
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
    --bench)
      mode="bench"
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
  load_root_env
  ensure_gdrive_oauth_client_config
fi

compose_args=()

if [ "$mode" = "bench" ]; then
  compose_args+=(-f docker-compose.bench.yml)
else
  compose_args+=(-f docker-compose.yml)
fi

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