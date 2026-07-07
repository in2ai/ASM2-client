./run.sh up --remote --gpu --qdrant nvidia -d

# ASM2-Client 📊

<div align="center">
    <img src="img/in2ai slogan.png" width="300">
</div>

## Descripción

`ASM2-Client` es el sistema cliente desarrollado por In2AI para la gestión documental, monitorización y analítica del sistema RAG (Retrieval-Augmented Generation).

El proyecto se compone ahora de varios módulos integrados:

1. **Backend FastAPI**: API principal para chat, conectores, autenticación y métricas.
2. **Dashboard SPA**: Frontend React/TanStack Router servido por Caddy y conectado al backend vía `/api`.
3. **Servicios auxiliares**: TimescaleDB para métricas, historial de chat y memoria del agente, Qdrant para vectores y Logto para autenticación.

Este sistema permite:

- Extraer y visualizar métricas de uso (modelos, tokens, latencia).
- Almacenamiento eficiente de series temporales.
- Gestión de usuarios y autenticación segura.
- Extracción automática de tópicos de documentos.
- Integración con el resto de servicios del nodo central.

## Arquitectura

El sistema se despliega mediante contenedores Docker orquestados:

| Servicio       | Descripción                                        |
| -------------- | -------------------------------------------------- |
| `backend`      | API FastAPI para chat, métricas y conectores       |
| `dashboard`    | SPA React servida por Caddy                        |
| `qdrant`       | Base vectorial para búsqueda híbrida               |
| `timescaledb`      | Instancia PostgreSQL + TimescaleDB compartida: datos de la aplicación y base independiente de Logto |
| `timescaledb-init` | Contenedor efímero para inicialización de esquemas |
| `logto`        | Proveedor de autenticación local opcional          |

## Requisitos

- **Docker** y **Docker Compose** (Recomendado para despliegue).
- **Python 3.9+** (Para desarrollo local del cliente).
- **Node.js 18+** y **pnpm** (Para desarrollo local del dashboard).

## Configuración

### Archivo `.env`

El proyecto requiere un archivo `.env` en la raíz. Copia el archivo de ejemplo y configura según tus necesidades:

```bash
cp .env.example .env
```

### Variables de Entorno Principales

#### Credenciales y API

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `OPENAI_API_KEY` | Clave de API para los modelos de OpenAI | `sk-...` |
| `TOGETHER_API_KEY` | Clave de API de Together.ai (usada por el LLM evaluador del benchmark) | `tgp_v1_...` |
| `CLIENT_SECRET` | JSON del cliente OAuth de Google (mismo contenido que `secrets/client_secret.json`; una sola línea en `.env`) | `{"web":{...}}` o `{"installed":{...}}` |
| `GOOGLE_CLIENT_SECRET_FILE` | Ruta opcional al fichero JSON del cliente OAuth cuando se monta en Docker | `/app/secrets/client_secret.json` |
| `GDRIVE_ROOTS` | IDs de las carpetas raíz de Google Drive que se indexarán (separados por comas) | `folder_id_1,folder_id_2` |
| `GDRIVE_EXCLUDE` | IDs de las carpetas de Google Drive que se excluirán de la indexación (separados por comas) | `folder_id_3,folder_id_4` |
| `HF_TOKEN` | Token de Hugging Face opcional usado solo en tiempo de build del backend para acelerar la descarga de modelos (evita el rate limit anónimo). No se usa en runtime. | `hf_...` |

#### TimescaleDB

| Variable | Descripción | Default |
| --- | --- | --- |
| `PG_HOST` | Host de TimescaleDB (`timescaledb` para Docker, IP para VPS) | `timescaledb` |
| `PG_PORT` | Puerto PostgreSQL | `5432` |
| `PG_USER` | Usuario de base de datos | `postgres` |
| `PG_PASSWORD` | Contraseña de PostgreSQL usada por backend e init SQL | `change_me_for_local_pg` |
| `PG_DB` | Nombre de la base de datos | `tsdb` |

#### Logto (Autenticación Dashboard)

| Variable | Descripción |
| --- | --- |
| `LOGTO_APP_ID` | ID de la aplicación SPA en Logto |
| `LOGTO_ENDPOINT` | Endpoint compartido de Logto usado por la SPA y por el backend |
| `LOGTO_API_RESOURCE` | Audience del API compartido entre la SPA y la validación estricta en FastAPI |
| `LOGTO_ADMIN_ENDPOINT` | Endpoint del panel de administración de Logto |
| `LOGTO_POSTGRES_PASSWORD` | Contraseña del rol `logto` dentro de la instancia PostgreSQL compartida |
| `LOGTO_MANAGEMENT_APP_ID` | Client ID opcional de la app M2M para la Management API |
| `LOGTO_MANAGEMENT_APP_SECRET` | Client secret opcional de la app M2M para la Management API |
| `LOGTO_MANAGEMENT_API_RESOURCE` | Resource opcional de la Management API de Logto |

#### Langfuse (Trazabilidad)

Tracing opcional de las llamadas LLM y del grafo de LangGraph. Si las tres variables están vacías, el backend arranca con el tracing desactivado y no envía datos a Langfuse.

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `LANGFUSE_PUBLIC_KEY` | Clave pública del proyecto (Langfuse UI → Settings → API Keys) | `pk-lf-...` |
| `LANGFUSE_SECRET_KEY` | Clave secreta del proyecto | `sk-lf-...` |
| `LANGFUSE_BASE_URL` | Host de Langfuse. |  |

#### Langfuse (Trazabilidad)

Tracing opcional de las llamadas LLM y del grafo de LangGraph. Si las tres variables están vacías, el backend arranca con el tracing desactivado y no envía datos a Langfuse.

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `LANGFUSE_PUBLIC_KEY` | Clave pública del proyecto (Langfuse UI → Settings → API Keys) | `pk-lf-...` |
| `LANGFUSE_SECRET_KEY` | Clave secreta del proyecto | `sk-lf-...` |
| `LANGFUSE_BASE_URL` | Host de Langfuse. |  |

#### Aplicación

| Variable | Descripción | Default |
| --- | --- | --- |
| `CORS_ALLOW_ORIGINS` | Orígenes CORS permitidos por el backend FastAPI (lista separada por comas) | `http://localhost:3000,http://localhost:3001,http://localhost:5173` |

#### Extracción de Tópicos

| Variable            | Descripción                                      | Default |
| ------------------- | ------------------------------------------------ | ------- |
| `CALCULATE_TOPICS`  | Habilitar extracción de tópicos (`True`/`False`) | `False` |
| `TOPIC_MIN_SIZE`    | Mínimo de chunks para extraer tópicos            | `20000` |
| `TOPIC_RESOLUTION`  | Resolución de detección (menor = más grueso)     | `0.025` |
| `TOPIC_MIN_CONTRIB` | Fracción mínima de representación del tópico     | `0.3`   |

### Desarrollo Local del Dashboard

Para el desarrollo del frontend fuera de Docker, usa `frontend/.env.local` con la URL del backend y el endpoint público de Logto.

El frontend acepta `VITE_LOGTO_*` y también los aliases `LOGTO_*` durante el build, pero en este repositorio los archivos Docker Compose usan explícitamente `VITE_LOGTO_*` para el dashboard.

> **Nota:** Para Google Drive, el backend puede leer el JSON del cliente desde la variable de entorno `CLIENT_SECRET` en `.env`, o usar el archivo `secrets/client_secret.json` montado en el contenedor mediante `GOOGLE_CLIENT_SECRET_FILE`.

## Instalación y Uso

### Archivos Docker Compose Disponibles

| Archivo | Descripción |
| --- | --- |
| `docker-compose.yml` | Stack base remoto-friendly (`backend`, `dashboard`, `qdrant`) con `backend` y `qdrant` solo en red interna Docker |
| `docker-compose.local.yml` | Override para infraestructura local (`timescaledb`, `timescaledb-init`, `logto`) con Logto publicado en `localhost` |
| `docker-compose.gpu.yml` | Override para habilitar GPU NVIDIA en `backend` |
| `docker-compose.gpu-amd.yml` | Override para habilitar GPU AMD (ROCm) en `backend` |
| `docker-compose.qdrant-nvidia.yml` | Override para Qdrant con GPU NVIDIA |
| `docker-compose.qdrant-amd.yml` | Override para Qdrant con GPU AMD (ROCm) |
| `docker-compose.bench.yml` | Stack para benchmark: reemplaza el web server del `backend` por el evaluador ([`benchmark.py`](backend/benchmark.py)) |

### Opción 1: Stack Local Completo (Recomendada)

Levanta backend, SPA, Qdrant, TimescaleDB y Logto local con un solo comando:

```bash
./run.sh up
```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Logto**: [http://localhost:3011](http://localhost:3011)

Servicios internos en este modo:

- **Backend API**: solo accesible desde la red Docker a través de `dashboard` y otros contenedores
- **Qdrant**: solo accesible desde la red Docker
- **TimescaleDB**: solo accesible desde la red Docker

### Opción 2: Servicios Remotos

Si TimescaleDB y Logto ya están desplegados fuera de Docker, ejecuta solo `backend`, `dashboard` y `qdrant`:

```bash
./run.sh up --remote
```

**Requisitos previos:**

1. Actualiza tu archivo `.env` con las URLs y credenciales remotas de TimescaleDB y Logto.

   ```env
    PG_HOST=tu-ip-o-hostname-vps
    PG_PORT=5432
    PG_USER=postgres
    PG_PASSWORD=tu_contraseña
    PG_DB=tsdb
    LOGTO_ENDPOINT=https://tu-logto-remoto
    LOGTO_APP_ID=tu_spa_app_id
    LOGTO_API_RESOURCE=https://tu-api-resource
   ```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)

Servicios internos en este modo:

- **Backend API**: solo accesible desde la red Docker a través de `dashboard`
- **Qdrant**: solo accesible desde la red Docker

### Opción 3: Docker con Soporte GPU (Backend)

El servicio `backend` puede utilizar GPU para acelerar el procesamiento local. Sin argumentos, `--gpu` mantiene la compatibilidad anterior y selecciona NVIDIA.

#### Backend con GPU NVIDIA

```bash
./run.sh up --gpu
# Equivalente explícito:
./run.sh up --gpu nvidia

# Con servicios remotos:
./run.sh up --remote --gpu nvidia
```

**Requisitos NVIDIA:**

- Drivers NVIDIA instalados
- [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

#### Backend con GPU AMD (ROCm)

```bash
./run.sh up --gpu amd

# AMD tanto en backend como en Qdrant:
./run.sh up --gpu amd --qdrant amd
```

El backend AMD utiliza por defecto la imagen validada `rocm/pytorch:rocm7.2.4_ubuntu22.04_py3.10_pytorch_release_2.9.1`. Se puede cambiar con `ROCM_PYTORCH_IMAGE` si el modelo de GPU requiere otra versión compatible.

**Requisitos AMD:**

- Linux y una GPU incluida en la [matriz de compatibilidad ROCm](https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html)
- Drivers AMD ROCm compatibles instalados
- Dispositivos `/dev/kfd` y `/dev/dri` accesibles
- Usuario en los grupos `video` y `render`

`run.sh` detecta automáticamente los GID de esos grupos. Si se invoca Docker Compose directamente, expórtalos antes:

```bash
export VIDEO_GID="$(getent group video | cut -d: -f3)"
export RENDER_GID="$(getent group render | cut -d: -f3)"
```

> La GPU del backend acelera principalmente el reranker y los embeddings locales (`USE_LOCAL_EMB=true`). Las llamadas a modelos OpenAI se ejecutan de forma remota.

### Opción 4: Qdrant con Aceleración GPU

Qdrant soporta aceleración GPU para indexación vectorial. Por defecto, se usa la versión CPU. Puedes habilitar GPU utilizando los archivos de override correspondientes:

#### GPU NVIDIA

```bash
./run.sh up --qdrant nvidia

# Combinando con GPU del backend:
./run.sh up --gpu --qdrant nvidia
```

**Requisitos NVIDIA:**

- Drivers NVIDIA instalados
- [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

#### GPU AMD (ROCm)

```bash
./run.sh up --qdrant amd
```

**Requisitos AMD:**

- Drivers AMD ROCm instalados
- Dispositivos `/dev/kfd` y `/dev/dri` accesibles
- Usuario en los grupos `video` y `render`

### Opción 5: Modelo local con Ollama

El archivo base `docker-compose.ollama.yml` contiene la configuración compartida. Selecciona el acelerador con el argumento opcional de `--local-model`:

Configura preferentemente un modelo del registro oficial de Ollama en `.env`:

```dotenv
USE_LOCAL_MODEL=true
OLLAMA_MODEL=qwen3.5:27b
LOCAL_HF_MODEL=
LOCAL_HF_MODEL_QUANT=
```

`OLLAMA_MODEL` tiene prioridad. `LOCAL_HF_MODEL` y `LOCAL_HF_MODEL_QUANT` se mantienen como alternativa para repositorios GGUF alojados en Hugging Face.

```bash
# CPU
./run.sh up --local-model cpu

# GPU NVIDIA
./run.sh up --local-model nvidia

# GPU AMD con ROCm
./run.sh up --local-model amd

# Ollama y Qdrant sobre AMD
./run.sh up --local-model amd --qdrant amd
```

Los overrides específicos son `docker-compose.ollama-nvidia.yml` y `docker-compose.ollama-amd.yml`. Si no se indica un acelerador, `--local-model` usa CPU.

Para AMD se requieren ROCm y acceso a `/dev/kfd` y `/dev/dri`. Para NVIDIA se requieren los drivers y `nvidia-container-toolkit`.

### Opción 6: Desarrollo Local

#### Backend FastAPI

```bash
cd backend

# Crear el entorno del proyecto e instalar dependencias
uv sync

# Ejecutar el backend
uv run uvicorn server:app --host 0.0.0.0 --port 8001
```

#### Dashboard (React SPA)

```bash
cd frontend

# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo
pnpm dev
```

El dashboard estará disponible en `http://localhost:3001`.

### Opción 7: Benchmark

El modo `--bench` levanta el stack sustituyendo el servidor web del `backend` por el script de evaluación [`benchmark.py`](backend/benchmark.py), que mide la calidad del pipeline RAG con métricas de **RAGAS `0.4.3`** (`context_precision`, `context_recall`, `answer_relevancy`, `faithfulness`) además de los tiempos de cada evaluación (consulta RAG + cálculo de métricas) y de cada lote.

> **Nota:** La versión de RAGAS (`0.4.3`) está fijada en [`backend/uv.lock`](backend/uv.lock) (specifier `ragas>=0.4.3`). El benchmark depende de la API `ragas.metrics.collections` de esa versión.

```bash
./run.sh up --bench
```

**Requisitos previos:**

- `TOGETHER_API_KEY` en `.env` (el LLM evaluador usa el modelo `meta-llama/Llama-3.3-70B-Instruct-Turbo` de Together.ai).
- `OPENAI_API_KEY` en `.env` (los embeddings del evaluador usan `text-embedding-3-small` de OpenAI).
- Un dataset de preguntas/respuestas en `benchmark/data/` (por defecto `dataset_asm2.csv`).

**Resultados:** se escriben en `benchmark/results/` (montado como volumen), entre otros:

- `rag_evaluation_results_attempt_N.csv` — resultados de métricas por pregunta.
- `query_timings_attempt_N.csv` — tiempo total por pregunta (consulta + métricas).
- `batch_timings_attempt_N.csv` — tiempo total por lote.
- `rag_evaluation_summary.csv` — resumen de métricas y tiempos por ejecución.

Por defecto realiza 3 ejecuciones de evaluación (`NUM_EVALUATIONS`).

## Estructura del Proyecto

```text
ASM2-client/
├── backend/                # Backend FastAPI y conectores
├── frontend/               # SPA React/TanStack Router
├── src/                    # Código fuente legacy del cliente Python
├── sql/                    # Scripts de inicialización de base de datos
├── secrets/                # Credenciales y ficheros sensibles
├── img/                    # Imágenes y assets
├── qdrant_index/           # Estado auxiliar y manifest del índice vectorial
├── questdb/               # Datos persistentes de QuestDB (generado)
├── benchmark/              # Datasets QA de entrada y resultados del benchmark de RAG
├── docker-compose.yml     # Stack base backend + SPA + qdrant con solo dashboard publicado en localhost
├── docker-compose.local.yml    # Infraestructura local (TimescaleDB + Logto) con Logto publicado en localhost
├── docker-compose.gpu.yml # Override para soporte GPU (backend)
├── docker-compose.qdrant-nvidia.yml # Override para Qdrant GPU NVIDIA
├── docker-compose.qdrant-amd.yml    # Override para Qdrant GPU AMD
├── docker-compose.bench.yml         # Stack para el benchmark de RAG
├── .env.example           # Plantilla de variables de entorno
└── run.sh                 # Wrapper de modos de ejecución Docker
```

---

<div align="center">
    <img src="img/LOGOS.png" width="800" alt="Logos de financiación IGAPE, Xunta de Galicia y NextGenerationEU">
    <p><i>Este proyecto ha sido financiado por el Instituto Galego de Promoción Económica (IGAPE) y la Xunta de Galicia en el marco del Plan de Recuperación, Transformación y Resiliencia, financiado por la Unión Europea – NextGenerationEU, dentro del procedimiento IG408M (“Ayudas para el desarrollo tecnológico y la innovación mediante el uso de la Inteligencia Artificial – IA360”).</i></p>
</div>
