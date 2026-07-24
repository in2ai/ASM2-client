#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./run.sh [up|down|build|config|logs|ps] [options] [-- extra docker compose args]

Modes:
  --local           Include local TimescaleDB and Logto services (default)
  --remote          Use external TimescaleDB and Logto services
  --bench           Just like --local, but changes entrypoint to a benchmark instead of the web server

AI:
  --local-model [cpu|nvidia|amd]
                    Include a local Ollama model (CPU by default)

Networking:
  dashboard         Published on localhost:3001
  logto             Published on localhost:3011 and localhost:3002 in --local mode
  backend/qdrant    Internal Docker network only
  timescaledb       Internal Docker network only in --local mode

Accelerators:
  --gpu [nvidia|amd]
                    Enable backend GPU acceleration (NVIDIA by default)
  --local-model cpu Run Ollama on CPU
  --local-model nvidia
                    Run Ollama on NVIDIA GPU
  --local-model amd Run Ollama on AMD GPU with ROCm
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
  ./run.sh up --gpu nvidia --qdrant nvidia
  ./run.sh up --remote --gpu amd
  ./run.sh up --local-model amd
  ./run.sh up --gpu amd --local-model amd
  ./run.sh up --local-model amd --qdrant amd
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

load_amd_device_group_ids() {
  local group_name group_id variable_name

  for group_name in video render; do
    variable_name="${group_name^^}_GID"
    group_id="${!variable_name:-}"

    if [ -z "$group_id" ]; then
      group_id="$(getent group "$group_name" | awk -F: 'NR == 1 { print $3 }')"
    fi

    if [ -z "$group_id" ]; then
      echo "ERROR: host group '$group_name' was not found; set $variable_name manually." >&2
      exit 1
    fi

    export "$variable_name=$group_id"
  done
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
backend_accelerator="cpu"
qdrant_accelerator="cpu"
local_model=0
ollama_accelerator="cpu"
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
      if [ "$#" -ge 2 ]; then
        case "$2" in
          cpu|none)
            backend_accelerator="cpu"
            shift 2
            ;;
          nvidia|amd)
            backend_accelerator="$2"
            shift 2
            ;;
          --*|up|down|build|config|logs|ps)
            backend_accelerator="nvidia"
            shift
            ;;
          *)
            echo "ERROR: --gpu accepts one of: nvidia, amd" >&2
            exit 1
            ;;
        esac
      else
        backend_accelerator="nvidia"
        shift
      fi
      ;;
    --local-model)
      local_model=1
      if [ "$#" -ge 2 ]; then
        case "$2" in
          cpu|nvidia|amd)
            ollama_accelerator="$2"
            shift 2
            ;;
          --*)
            shift
            ;;
          *)
            echo "ERROR: --local-model accepts one of: cpu, nvidia, amd" >&2
            exit 1
            ;;
        esac
      else
        shift
      fi
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

case "$backend_accelerator" in
  cpu|nvidia|amd)
    ;;
  *)
    echo "ERROR: unsupported backend accelerator '$backend_accelerator'" >&2
    exit 1
    ;;
esac

case "$qdrant_accelerator" in
  cpu|nvidia|amd)
    ;;
  *)
    echo "ERROR: unsupported Qdrant accelerator '$qdrant_accelerator'" >&2
    exit 1
    ;;
esac

case "$ollama_accelerator" in
  cpu|nvidia|amd)
    ;;
  *)
    echo "ERROR: unsupported Ollama accelerator '$ollama_accelerator'" >&2
    exit 1
    ;;
esac

if [ "$action" = "up" ]; then
  load_root_env
  ensure_gdrive_oauth_client_config
fi

if [ "$backend_accelerator" = "amd" ] || [ "$qdrant_accelerator" = "amd" ]; then
  load_amd_device_group_ids
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

if [ "$local_model" -eq 1 ]; then
  compose_args+=(-f docker-compose.ollama.yml)

  case "$ollama_accelerator" in
    nvidia)
      compose_args+=(-f docker-compose.ollama-nvidia.yml)
      ;;
    amd)
      compose_args+=(-f docker-compose.ollama-amd.yml)
      ;;
  esac
fi

case "$backend_accelerator" in
  nvidia)
    compose_args+=(-f docker-compose.gpu.yml)
    ;;
  amd)
    compose_args+=(-f docker-compose.gpu-amd.yml)
    ;;
esac

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
