# ASM2-Client 📊

<div align="center">
    <img src="img/in2ai slogan.png" width="300">
</div>

## Descripción

`ASM2-Client` es el sistema cliente desarrollado por In2AI para la gestión documental, monitorización y analítica del sistema RAG (Retrieval-Augmented Generation).

El proyecto se compone ahora de varios módulos integrados:

1. **Backend FastAPI**: API principal para chat, conectores, autenticación y métricas.
2. **Dashboard SPA**: Frontend React/TanStack Router servido por Caddy y conectado al backend vía `/api`.
3. **Servicios auxiliares**: QuestDB para métricas, Qdrant para vectores y Logto para autenticación.

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
| `questdb`      | Base de datos Time-Series para métricas            |
| `questdb-init` | Contenedor efímero para inicialización de esquemas |
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
| `FOLDER_ID` | ID de carpeta para almacenamiento (Google Drive) | `1ABC...` |
| `CLIENT_SECRET` | JSON del cliente OAuth de Google (mismo contenido que `secrets/client_secret.json`; una sola línea en `.env`) | `{"web":{...}}` o `{"installed":{...}}` |
| `GOOGLE_CLIENT_SECRET_FILE` | Ruta opcional al fichero JSON del cliente OAuth cuando se monta en Docker | `/app/secrets/client_secret.json` |
| `HF_TOKEN` | Token de Hugging Face opcional usado solo en tiempo de build del backend para acelerar la descarga de modelos (evita el rate limit anónimo). No se usa en runtime. | `hf_...` |

#### QuestDB

| Variable | Descripción | Default |
| --- | --- | --- |
| `QUESTDB_HOST` | Host de QuestDB (`questdb` para Docker, IP para VPS) | `questdb` |
| `QUESTDB_PORT` | Puerto PostgreSQL wire protocol | `8812` |
| `QUESTDB_USER` | Usuario de base de datos | `admin` |
| `QUESTDB_PASSWORD` | Contraseña del acceso PostgreSQL wire protocol usado por backend e init SQL | `change_me_for_local_pgwire` |
| `QUESTDB_DB` | Nombre de la base de datos | `qdb` |
| `QUESTDB_HTTP_USER` | Usuario del panel web / API HTTP de QuestDB | `admin` |
| `QUESTDB_HTTP_PASSWORD` | Contraseña del panel web / API HTTP de QuestDB | `change_me_for_local_http` |

#### Logto (Autenticación Dashboard)

| Variable | Descripción |
| --- | --- |
| `LOGTO_APP_ID` | ID de la aplicación SPA en Logto |
| `LOGTO_ENDPOINT` | Endpoint compartido de Logto usado por la SPA y por el backend |
| `LOGTO_API_RESOURCE` | Audience del API compartido entre la SPA y la validación estricta en FastAPI |
| `LOGTO_ADMIN_ENDPOINT` | Endpoint del panel de administración de Logto |
| `LOGTO_POSTGRES_PASSWORD` | Contraseña de PostgreSQL usada por Logto self-hosted |
| `LOGTO_MANAGEMENT_APP_ID` | Client ID opcional de la app M2M para la Management API |
| `LOGTO_MANAGEMENT_APP_SECRET` | Client secret opcional de la app M2M para la Management API |
| `LOGTO_MANAGEMENT_API_RESOURCE` | Resource opcional de la Management API de Logto |

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
| `docker-compose.local.yml` | Override para infraestructura local (`questdb`, `questdb-init`, `logto`) con QuestDB web publicado en `localhost:9000` |
| `docker-compose.gpu.yml` | Override para habilitar soporte GPU en `backend` |
| `docker-compose.qdrant-nvidia.yml` | Override para Qdrant con GPU NVIDIA |
| `docker-compose.qdrant-amd.yml` | Override para Qdrant con GPU AMD (ROCm) |

### Opción 1: Stack Local Completo (Recomendada)

Levanta backend, SPA, Qdrant, QuestDB y Logto local con un solo comando:

```bash
./run.sh up
```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Logto**: [http://localhost:3011](http://localhost:3011)

Servicios internos en este modo:

- **Backend API**: solo accesible desde la red Docker a través de `dashboard` y otros contenedores
- **Qdrant**: solo accesible desde la red Docker
- **QuestDB**: solo accesible desde la red Docker

### Opción 2: Servicios Remotos

Si QuestDB y Logto ya están desplegados fuera de Docker, ejecuta solo `backend`, `dashboard` y `qdrant`:

```bash
./run.sh up --remote
```

**Requisitos previos:**

1. Actualiza tu archivo `.env` con las URLs y credenciales remotas de QuestDB y Logto.

   ```env
    QUESTDB_HOST=tu-ip-o-hostname-vps
    QUESTDB_PORT=8812
    QUESTDB_USER=admin
    QUESTDB_PASSWORD=tu_contraseña
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

El servicio `backend` puede utilizar GPU para acelerar el procesamiento. Para habilitar GPU:

```bash
./run.sh up --gpu

# Con servicios remotos:
./run.sh up --remote --gpu
```

**Requisitos para GPU:**

- Drivers NVIDIA instalados
- [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

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

### Opción 5: Desarrollo Local

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
├── docker-compose.yml     # Stack base backend + SPA + qdrant con solo dashboard publicado en localhost
├── docker-compose.local.yml    # Infraestructura local (QuestDB + Logto) con Logto publicado en localhost
├── docker-compose.gpu.yml # Override para soporte GPU (backend)
├── docker-compose.qdrant-nvidia.yml # Override para Qdrant GPU NVIDIA
├── docker-compose.qdrant-amd.yml    # Override para Qdrant GPU AMD
├── .env.example           # Plantilla de variables de entorno
└── run.sh                 # Wrapper de modos de ejecución Docker
```

---

<div align="center">
    <img src="img/LOGOS.png" width="800" alt="Logos de financiación IGAPE, Xunta de Galicia y NextGenerationEU">
    <p><i>Este proyecto ha sido financiado por el Instituto Galego de Promoción Económica (IGAPE) y la Xunta de Galicia en el marco del Plan de Recuperación, Transformación y Resiliencia, financiado por la Unión Europea – NextGenerationEU, dentro del procedimiento IG408M (“Ayudas para el desarrollo tecnológico y la innovación mediante el uso de la Inteligencia Artificial – IA360”).</i></p>
</div>
