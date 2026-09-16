# ASM2-Client 📊

<div align="center">
    <img src="img/in2ai slogan.png" width="300">
</div>

## Descripción

`ASM2-Client` es el sistema cliente desarrollado por In2AI para la gestión documental, monitorización y analítica del sistema RAG (Retrieval-Augmented Generation).

El proyecto se compone de varios módulos integrados:

1. **Backend FastAPI**: API principal para chat, conectores, autenticación, indexado y métricas.
2. **Dashboard SPA**: Frontend React/TanStack Router servido por Caddy y conectado al backend vía `/api`.
3. **Servicios auxiliares**: TimescaleDB para métricas, historial de chat y credenciales, Qdrant para vectores, Logto para autenticación y, opcionalmente, Ollama para modelos locales.

Este sistema permite:

- Chat RAG sobre documentos de Google Drive y Dropbox, con filtrado de resultados por los permisos reales de cada usuario.
- Generación de documentos (`pdf`, `markdown`, `txt`) como herramienta del agente, descargables desde el chat.
- Indexado compartido gestionado por administradores, con progreso visible para managers y administradores.
- Protección ante borrados masivos durante el indexado, con alertas y notificaciones.
- Extraer y visualizar métricas de uso (modelos, tokens, latencia, actividad de usuarios).
- Almacenamiento eficiente de series temporales.
- Gestión de usuarios y autenticación segura con roles (`admin`, `manager`, `user`).
- Extracción automática de tópicos de documentos.

## Documentación relacionada

| Documento | Contenido |
| --- | --- |
| [DROPBOX_CONNECTOR.md](DROPBOX_CONNECTOR.md) | Modelo de permisos del conector de Dropbox y creación de la app |
| [LOGTO_SETUP.md](LOGTO_SETUP.md) | Configuración de Logto para la SPA y el API de FastAPI |
| [SISTEMA_ALERTAS_INDEXADO.md](SISTEMA_ALERTAS_INDEXADO.md) | Guard de borrados masivos, alertas y notificaciones |
| [DOKPLOY_HOME_SERVER.md](DOKPLOY_HOME_SERVER.md) | Despliegue del stack completo en Dokploy |
| [GOOGLE_DRIVE_MIGRATION_STATUS.md](GOOGLE_DRIVE_MIGRATION_STATUS.md) | Informe de la migración de Google Drive desde la app Streamlit |
| [benchmark/README.md](benchmark/README.md) | Benchmark RAG: flujo, variables y métricas |
| [frontend/README.md](frontend/README.md) | Desarrollo y despliegue del dashboard |

## Arquitectura

El sistema se despliega mediante contenedores Docker orquestados:

| Servicio | Descripción |
| --- | --- |
| `backend` | API FastAPI para chat, métricas, indexado y conectores |
| `dashboard` | SPA React servida por Caddy, que además hace de proxy `/api/*` hacia `backend:8001` |
| `qdrant` | Base vectorial para búsqueda híbrida |
| `timescaledb` | Instancia PostgreSQL + TimescaleDB compartida: datos de la aplicación y base independiente de Logto |
| `timescaledb-init` | Contenedor efímero para inicialización de esquemas |
| `logto` | Proveedor de autenticación local opcional |
| `ollama` | Servidor de modelos locales opcional (`--local-model`) |

## Requisitos

- **Docker** y **Docker Compose** (recomendado para despliegue).
- **Python 3.10–3.13** y [**uv**](https://docs.astral.sh/uv/) (para desarrollo local del backend; `backend/pyproject.toml` fija `requires-python = ">=3.10,<3.14"`).
- **Node.js 24** y **pnpm 11** (para desarrollo local del dashboard; la imagen de build usa `node:24-alpine` y `package.json` fija `packageManager: pnpm@11.11.0`).

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
| `TOGETHER_API_KEY` | Clave de API de Together.ai (solo si se cambia el LLM evaluador del benchmark a `together`) | `tgp_v1_...` |
| `CLIENT_SECRET` | JSON del cliente OAuth de Google (mismo contenido que `secrets/client_secret.json`; una sola línea en `.env`) | `{"web":{...}}` o `{"installed":{...}}` |
| `GOOGLE_CLIENT_SECRET_FILE` | Ruta opcional al fichero JSON del cliente OAuth cuando se monta en Docker. Por defecto `secrets/client_secret.json` | `/app/secrets/client_secret.json` |
| `GDRIVE_ROOTS` | IDs de las carpetas raíz de Google Drive que se indexarán (separados por comas) | `folder_id_1,folder_id_2` |
| `GDRIVE_EXCLUDE` | IDs de las carpetas de Google Drive que se excluirán de la indexación (separados por comas) | `folder_id_3,folder_id_4` |
| `DROPBOX_APP_KEY` | App key de la app de Dropbox (*user-scoped*, sin team scopes) | `abc123def456ghi` |
| `DROPBOX_APP_SECRET` | App secret de la misma app de Dropbox | `jkl789mno012pqr` |
| `DROPBOX_ROOTS` | Rutas de las carpetas a indexar, relativas a la raíz del espacio de equipo (separadas por comas). Vacío no indexa nada; `/` indexa todo el espacio de equipo | `Seguridad,Shared/Wiki` |
| `DROPBOX_EXCLUDE` | Rutas de las carpetas de Dropbox que se excluirán de la indexación (separadas por comas) | `Seguridad/Drafts` |
| `HF_TOKEN` | Token de Hugging Face opcional usado solo en tiempo de build del backend para acelerar la descarga de modelos (evita el rate limit anónimo). No se usa en runtime. | `hf_...` |

#### TimescaleDB

| Variable | Descripción | Default |
| --- | --- | --- |
| `PG_HOST` | Host de TimescaleDB. `run.sh` lo fuerza a `timescaledb` en `--local` y `--remote`; solo se usa fuera de Docker | `timescaledb` |
| `PG_PORT` | Puerto PostgreSQL. `run.sh` lo fuerza a `5432` en `--local` y `--remote` | `5432` |
| `PG_USER` | Usuario de base de datos | `postgres` |
| `PG_PASSWORD` | Contraseña de PostgreSQL usada por backend e init SQL | *(vacío)* |
| `PG_DB` | Nombre de la base de datos | `tsdb` |

#### Qdrant

| Variable | Descripción | Default |
| --- | --- | --- |
| `QDRANT_HOST` | Host del servicio Qdrant, resuelto dentro de la red Docker | `qdrant` |
| `QDRANT_META_PATH` | Ruta del manifiesto del índice dentro del contenedor (volumen `backend-data`) | `/app/data/qdrant_meta` |

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
| `LOGTO_MANAGEMENT_API_RESOURCE` | Resource opcional de la Management API de Logto (default `https://default.logto.app/api`) |

> El backend resuelve los roles (`admin`, `manager`, `user`) contra la Management API de Logto. Sin credenciales M2M no puede resolverlos, y las rutas protegidas por rol quedan inaccesibles.

#### Modelos

| Variable | Descripción | Default |
| --- | --- | --- |
| `OPENAI_MODEL` | Modelo de OpenAI usado para el chat y para el juez de relevancia de chunks | `gpt-4o-mini` |
| `OPENAI_REASONING_EFFORT` | Esfuerzo de razonamiento; solo lo usan los modelos razonadores (`gpt-5*`, `o1`/`o3`/`o4`) y solo para la respuesta del chat. Con cualquier valor distinto de `none`, esa llamada pasa a la Responses API | `none` |
| `USE_LOCAL_MODEL` | Usar el servicio `ollama` en lugar de OpenAI para el chat | `false` |
| `OLLAMA_MODEL` | Modelo del registro oficial de Ollama. Tiene prioridad sobre `LOCAL_HF_MODEL` | *(vacío)* |
| `LOCAL_HF_MODEL` | Alternativa: repositorio GGUF de Hugging Face | *(vacío)* |
| `LOCAL_HF_MODEL_QUANT` | Cuantización del repositorio GGUF anterior | *(vacío)* |
| `USE_LOCAL_EMB` | Usar embeddings locales (`sentence-transformers`) en lugar de los de OpenAI. También es argumento de build del backend, que precarga el modelo en la imagen | `false` |
| `LOCAL_EMB_REPO` | Repositorio del modelo de embeddings local | *(vacío)* |
| `HOST_PORT` | Puerto del host donde se publica `ollama` cuando se usa `--local-model` | `11434` |

#### Langfuse (Trazabilidad)

Tracing opcional de las llamadas LLM y del grafo de LangGraph. Si las tres variables están vacías, el backend arranca con el tracing desactivado y no envía datos a Langfuse.

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `LANGFUSE_PUBLIC_KEY` | Clave pública del proyecto (Langfuse UI → Settings → API Keys) | `pk-lf-...` |
| `LANGFUSE_SECRET_KEY` | Clave secreta del proyecto | `sk-lf-...` |
| `LANGFUSE_BASE_URL` | Host de Langfuse (EU: `https://cloud.langfuse.com`, US: `https://us.cloud.langfuse.com`) | |

#### Aplicación

| Variable | Descripción | Default |
| --- | --- | --- |
| `CORS_ALLOW_ORIGINS` | Orígenes CORS permitidos por el backend FastAPI (lista separada por comas) | `http://localhost:3000,http://localhost:3001,http://localhost:5173` |

#### Recuperación y Contexto Largo

| Variable | Descripción | Default |
| --- | --- | --- |
| `PREV_CHUNKS` | Chunks anteriores que se añaden a cada chunk recuperado | `1` |
| `NEXT_CHUNKS` | Chunks posteriores que se añaden a cada chunk recuperado | `2` |
| `LONG_CONTEXT` | Habilitar el pipeline de contexto largo sobre los ficheros relevantes | `false` |
| `LONG_CONTEXT_IMGS` | Analizar también las imágenes de los ficheros en contexto largo | `false` |
| `LONG_CONTEXT_BEFORE_FILTER` | Analizar los ficheros relevantes antes de filtrar chunks. Mejor razonamiento, peor rendimiento | `false` |

#### Extracción de Tópicos

| Variable | Descripción | Default |
| --- | --- | --- |
| `CALCULATE_TOPICS` | Habilitar extracción de tópicos (`True`/`False`) | `False` |
| `TOPIC_MIN_SIZE` | Mínimo de chunks para extraer tópicos | `20000` |
| `TOPIC_RESOLUTION` | Resolución de detección (menor = más grueso) | `0.0125` |
| `TOPIC_MIN_CONTRIB` | Fracción mínima de representación del tópico | `0.3` |
| `MIN_COMMUNITY_DOCS` | Mínimo de documentos que debe abarcar un tópico | `2` |
| `MIN_COMMUNITY_SIZE` | Mínimo de chunks para que un tópico sea válido | `300` |
| `MAX_TOPICS` | Máximo de tópicos; si se detectan más, se conservan los más representativos | `300` |

### Desarrollo Local del Dashboard

Para el desarrollo del frontend fuera de Docker, usa `frontend/.env.local` (o el `.env` de la raíz, que es el `envDir` configurado en Vite) con la URL del backend y el endpoint público de Logto.

`frontend/vite.config.ts` lee los nombres **sin** prefijo `VITE_` (`LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_API_RESOURCE`, `BACKEND_URL`) y los inyecta en el bundle como `import.meta.env.VITE_*`. Por eso los archivos Docker Compose pasan `LOGTO_*` como build args del dashboard.

> **Nota:** Para Google Drive, el backend puede leer el JSON del cliente desde la variable de entorno `CLIENT_SECRET` en `.env`, o usar el archivo `secrets/client_secret.json` montado en el contenedor mediante `GOOGLE_CLIENT_SECRET_FILE`.
>
> **Nota:** Dropbox usa una app *user-scoped*: cada usuario conecta su propia cuenta y no hace falta ser administrador del equipo de Dropbox. No marques ningún *team scope* en la App Console, o Dropbox exigirá un administrador al autorizar. El funcionamiento del conector y los pasos para crear la app se documentan en [DROPBOX_CONNECTOR.md](DROPBOX_CONNECTOR.md).

## Instalación y Uso

### Archivos Docker Compose Disponibles

| Archivo | Descripción |
| --- | --- |
| `docker-compose.yml` | Stack base (`backend`, `dashboard`, `qdrant`) |
| `docker-compose.timescaledb.yml` | Override con TimescaleDB local (`timescaledb`, `timescaledb-init`), aplicado siempre en `--local` y `--remote` |
| `docker-compose.local.yml` | Override para Logto local (`logto`) publicado en `localhost` |
| `docker-compose.gpu.yml` | Override para habilitar GPU NVIDIA en `backend` |
| `docker-compose.gpu-amd.yml` | Override para habilitar GPU AMD (ROCm) en `backend`, usando `Dockerfile.rocm` |
| `docker-compose.qdrant-nvidia.yml` | Override para Qdrant con GPU NVIDIA |
| `docker-compose.qdrant-amd.yml` | Override para Qdrant con GPU AMD (ROCm) |
| `docker-compose.ollama.yml` | Servicio `ollama` para modelos locales (CPU) |
| `docker-compose.ollama-nvidia.yml` | Override de `ollama` con GPU NVIDIA |
| `docker-compose.ollama-amd.yml` | Override de `ollama` con GPU AMD (ROCm) |
| `docker-compose.bench.yml` | Stack **autocontenido** para benchmark: reemplaza el web server del `backend` por el evaluador ([`benchmark.py`](backend/benchmark.py)) |
| `docker-compose.dokploy.yml` | Stack de producción para Dokploy, con GPU NVIDIA y red `dokploy-network`. Ver [DOKPLOY_HOME_SERVER.md](DOKPLOY_HOME_SERVER.md) |

### Puertos publicados

Con `./run.sh up` (`--local` o `--remote`):

| Servicio | Publicación |
| --- | --- |
| `dashboard` | `3001` en todas las interfaces → [http://localhost:3001](http://localhost:3001) |
| `backend` | `127.0.0.1:8001` (solo el host; el tráfico normal entra por Caddy en `/api`) |
| `timescaledb` | `127.0.0.1:5432` (para inspeccionar la base desde el host) |
| `logto` | `3011` (endpoint) y `3002` (consola de administración), solo en `--local` |
| `qdrant` | No publicado: solo accesible desde la red Docker |
| `ollama` | `${HOST_PORT:-11434}`, solo con `--local-model` |

### Opción 1: Stack Local Completo (Recomendada)

Levanta backend, SPA, Qdrant, TimescaleDB y Logto local con un solo comando:

```bash
./run.sh up
```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Logto**: [http://localhost:3011](http://localhost:3011)
- **Consola de Logto**: [http://localhost:3002](http://localhost:3002)

### Opción 2: Servicios Remotos

Si Logto ya está desplegado fuera de Docker, ejecuta `backend`, `dashboard`, `qdrant` y TimescaleDB local, sin `logto`:

```bash
./run.sh up --remote
```

TimescaleDB **no** se toma del despliegue remoto: este modo levanta su propio contenedor
`timescaledb` igual que `--local`, con los datos en el volumen `timescaledb-data`.

**Requisitos previos:**

1. Actualiza tu archivo `.env` con las URLs y credenciales remotas de Logto. Las variables
   `PG_*` describen la base local: `PG_HOST` y `PG_PORT` los sobrescribe el override a
   `timescaledb:5432`, mientras que `PG_USER`, `PG_PASSWORD` y `PG_DB` crean la base local.

   ```env
    PG_USER=postgres
    PG_PASSWORD=tu_contraseña
    PG_DB=tsdb
    LOGTO_ENDPOINT=https://tu-logto-remoto
    LOGTO_APP_ID=tu_spa_app_id
    LOGTO_API_RESOURCE=https://tu-api-resource
   ```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)

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

El backend AMD se construye con `backend/Dockerfile.rocm` y utiliza por defecto la imagen validada `rocm/pytorch:rocm7.2.4_ubuntu22.04_py3.10_pytorch_release_2.9.1`. Se puede cambiar con `ROCM_PYTORCH_IMAGE` si el modelo de GPU requiere otra versión compatible.

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

Qdrant soporta aceleración GPU para indexación vectorial. Por defecto, se usa la versión CPU (`qdrant/qdrant:v1.16.2`). Puedes habilitar GPU utilizando los archivos de override correspondientes:

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

`OLLAMA_MODEL` tiene prioridad. `LOCAL_HF_MODEL` y `LOCAL_HF_MODEL_QUANT` se mantienen como alternativa para repositorios GGUF alojados en Hugging Face. El backend se conecta al servicio en `http://ollama:11434/v1` mediante la API compatible con OpenAI.

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

Las pruebas del backend viven en `backend/tests/` e importan como `src.*`, así que se ejecutan desde `backend/`:

```bash
cd backend
pytest
```

> `pytest` no está declarado en `backend/pyproject.toml`; instálalo en el entorno antes de ejecutar las pruebas.

#### Dashboard (React SPA)

```bash
cd frontend

# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo
pnpm dev
```

El dashboard estará disponible en `http://localhost:3001`.

El frontend usa [Vite+](https://viteplus.dev/) (`vp`) a través de los scripts de `package.json`:

```bash
pnpm check   # formato, lint y comprobación de tipos
pnpm test    # pruebas unitarias (Vitest)
pnpm test:e2e  # pruebas end-to-end (Playwright)
pnpm build   # build de producción en dist/
```

### Opción 7: Benchmark

El modo `--bench` levanta un stack autocontenido (`backend`, `dashboard`, `qdrant`, **sin** TimescaleDB ni Logto) sustituyendo el servidor web del `backend` por el script de evaluación [`benchmark.py`](backend/benchmark.py), que mide la calidad del pipeline RAG con métricas de **RAGAS `0.4.3`** (`context_precision`, `context_recall`, `answer_relevancy`, `faithfulness`) además de los tiempos de cada evaluación (consulta RAG + cálculo de métricas) y de cada lote.

> El funcionamiento del benchmark (flujo de ejecución, variables parametrizables, métricas y ficheros de salida) se documenta en detalle en el [README del benchmark](benchmark/README.md).

> **Nota:** La versión de RAGAS (`0.4.3`) está fijada en [`backend/uv.lock`](backend/uv.lock) (specifier `ragas>=0.4.3`). El benchmark depende de la API `ragas.metrics.collections` de esa versión.

```bash
./run.sh up --bench
```

**Requisitos previos:**

- `OPENAI_API_KEY` en `.env`. Es obligatoria en cualquier caso: el LLM evaluador por defecto es `gpt-4o-mini` de OpenAI (`EVAL_LLM_PROVIDER = "openai"` en [`backend/benchmark.py`](backend/benchmark.py)) y los embeddings de `answer_relevancy` usan siempre `text-embedding-3-small` de OpenAI.
- `TOGETHER_API_KEY` en `.env` **solo** si cambias `EVAL_LLM_PROVIDER` a `"together"`, que usa `meta-llama/Llama-3.3-70B-Instruct-Turbo`.
- Un dataset de preguntas/respuestas en `benchmark/data/` (por defecto `dataset_asm2.csv`).
- Una base PostgreSQL alcanzable. `benchmark.py` construye el pool al importarse
  (`get_pg_pool()` usa `minconn=1`, que abre la conexión de inmediato), pero
  `docker-compose.bench.yml` **no** define el servicio `timescaledb` y `run.sh --bench` no
  aplica el override. Apunta `PG_HOST`/`PG_PORT` a una base accesible, o levanta el stack
  a mano añadiendo el override:

  ```bash
  docker compose -f docker-compose.bench.yml -f docker-compose.timescaledb.yml up --build
  ```

**Resultados:** se escriben en `benchmark/results/` (montado como volumen), entre otros:

- `rag_evaluation_results_<fuentes>_attempt_<n>.csv` — resultados de métricas por pregunta.
- `query_timings_<fuentes>_attempt_<n>.csv` — tiempo total por pregunta (consulta + métricas).
- `batch_timings_<fuentes>_attempt_<n>.csv` — tiempo total por lote.
- `rag_evaluation_summary_<fuentes>.csv` — resumen de métricas y tiempos por ejecución.

Por defecto realiza 1 ejecución de evaluación (`NUM_EVALUATIONS`).

## Estructura del Proyecto

```text
ASM2-client/
├── backend/                # Backend FastAPI, conectores, grafo LangGraph y pruebas
│   ├── server.py           # Endpoints HTTP y tareas periódicas
│   ├── benchmark.py        # Evaluador RAG usado por --bench
│   ├── graph/              # Grafo LangGraph: nodos, estado y herramientas del agente
│   ├── src/                # Conectores, indexado, métricas, generación y config
│   └── tests/              # Pruebas de backend
├── frontend/               # SPA React/TanStack Router servida por Caddy
├── sql/                    # Inicialización de TimescaleDB y arranque de Logto
├── secrets/                # Credenciales y ficheros sensibles
├── ollama/                 # Imagen del servidor de modelos locales
├── img/                    # Imágenes y assets
├── benchmark/              # Datasets QA de entrada, generación y resultados del benchmark
├── docker-compose*.yml     # Stack base y overrides (ver tabla más arriba)
├── .env.example            # Plantilla de variables de entorno
└── run.sh                  # Wrapper de modos de ejecución Docker
```

---

<div align="center">
    <img src="img/LOGOS.png" width="800" alt="Logos de financiación IGAPE, Xunta de Galicia y NextGenerationEU">
    <p><i>Este proyecto ha sido financiado por el Instituto Galego de Promoción Económica (IGAPE) y la Xunta de Galicia en el marco del Plan de Recuperación, Transformación y Resiliencia, financiado por la Unión Europea – NextGenerationEU, dentro del procedimiento IG408M (“Ayudas para el desarrollo tecnológico y la innovación mediante el uso de la Inteligencia Artificial – IA360”).</i></p>
</div>
