# ASM2-Client 📊

<div align="center">
    <img src="img/in2ai slogan.png" width="300">
</div>

## Descripción

`ASM2-Client` es el sistema cliente desarrollado por In2AI para la gestión documental, monitorización y analítica del sistema RAG (Retrieval-Augmented Generation).

El proyecto se compone ahora de varios módulos integrados:

1. **Cliente Python (Streamlit)**: Interfaz de usuario para la interacción directa con modelos y gestión de documentos.
2. **Base de Datos (QuestDB)**: Base de datos de series temporales para almacenar métricas de alto rendimiento.
3. **Dashboard (Next.js)**: Nueva interfaz de administración y visualización de analíticas avanzada, con autenticación gestionada por WorkOS.

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
| `app`          | Servicio de Streamlit (Python)                     |
| `questdb`      | Base de datos Time-Series                          |
| `dashboard`    | Aplicación Next.js para métricas y administración  |
| `questdb-init` | Contenedor efímero para inicialización de esquemas |

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

| Variable                | Descripción                                      | Ejemplo         |
| ----------------------- | ------------------------------------------------ | --------------- |
| `OPENAI_API_KEY`        | Clave de API para los modelos de OpenAI          | `sk-...`        |
| `FOLDER_ID`             | ID de carpeta para almacenamiento (Google Drive) | `1ABC...`       |
| `CLIENT_SECRET`         | JSON de credenciales OAuth de Google (principal) | `{"web":{...}}` |
| `CLIENT_SECRET_WEBSITE` | JSON de credenciales OAuth de Google (website)   | `{"web":{...}}` |

#### QuestDB

| Variable           | Descripción                                          | Default   |
| ------------------ | ---------------------------------------------------- | --------- |
| `QUESTDB_HOST`     | Host de QuestDB (`questdb` para Docker, IP para VPS) | `questdb` |
| `QUESTDB_PORT`     | Puerto PostgreSQL wire protocol                      | `8812`    |
| `QUESTDB_USER`     | Usuario de base de datos                             | `admin`   |
| `QUESTDB_PASSWORD` | Contraseña de base de datos                          | `quest`   |
| `QUESTDB_DB`       | Nombre de la base de datos                           | `qdb`     |

#### WorkOS (Autenticación Dashboard)

| Variable                          | Descripción                                                         |
| --------------------------------- | ------------------------------------------------------------------- |
| `WORKOS_API_KEY`                  | API Key de WorkOS (ej. `sk_test_...` o `sk_live_...`)               |
| `WORKOS_CLIENT_ID`                | Client ID de la aplicación (ej. `client_...`)                       |
| `WORKOS_COOKIE_PASSWORD`          | Contraseña segura para encriptación de cookies (mín. 32 caracteres) |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | URI de redirección (ej. `http://localhost:3001/api/auth/callback`)  |
| `REDIRECT_URI`                    | URI de redirección para Streamlit (ej. `http://localhost:8501/`)    |

#### Aplicación

| Variable              | Descripción                                                                                   | Default                 |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| `NODE_ENV`            | Entorno de ejecución (`development`, `production`)                                            | `development`           |
| `PORT`                | Puerto del dashboard Next.js                                                                  | `3001`                  |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app (para redirects y OAuth). En Dokploy: `https://${{DOKPLOY_DEPLOY_URL}}` | `http://localhost:3001` |
| `TZ`                  | Zona horaria                                                                                  | `Europe/Madrid`         |
| `SKIP_ENV_VALIDATION` | Omitir validación de variables (útil para builds)                                             | `false`                 |

#### Extracción de Tópicos

| Variable            | Descripción                                      | Default |
| ------------------- | ------------------------------------------------ | ------- |
| `CALCULATE_TOPICS`  | Habilitar extracción de tópicos (`True`/`False`) | `False` |
| `TOPIC_MIN_SIZE`    | Mínimo de chunks para extraer tópicos            | `20000` |
| `TOPIC_RESOLUTION`  | Resolución de detección (menor = más grueso)     | `0.025` |
| `TOPIC_MIN_CONTRIB` | Fracción mínima de representación del tópico     | `0.3`   |

### Desarrollo Local del Dashboard

Para **desarrollo local del Dashboard**, crea un archivo `.env.local` en la carpeta `dashboard/` para asegurar la conexión a la base de datos (que se ejecuta en Docker pero se accede via `localhost`):

```env
QUESTDB_HOST=localhost
```

> **Nota:** Asegúrate de tener los archivos de secrets (`client_secret.json`, etc.) en la carpeta `secrets/` si son requeridos por el cliente Python.

## Instalación y Uso

### Archivos Docker Compose Disponibles

| Archivo                     | Descripción                                              |
| --------------------------- | -------------------------------------------------------- |
| `docker-compose.yml`        | Stack completo local (app, questdb, dashboard, init)     |
| `docker-compose.remote.yml` | Solo app y dashboard, conecta a QuestDB remoto           |
| `docker-compose.gpu.yml`    | Override para habilitar soporte GPU en el servicio `app` |

### Opción 1: Docker Stack Completo (Recomendada)

Levanta todos los servicios con un solo comando:

```bash
docker compose up --build
```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Cliente Streamlit**: [http://localhost:8501](http://localhost:8501)
- **Consola QuestDB**: [http://localhost:9000](http://localhost:9000)

### Opción 2: Docker con QuestDB Remoto (VPS)

Si ya tienes QuestDB desplegado en un VPS, puedes ejecutar solo los servicios `app` y `dashboard` conectándose a la instancia remota:

```bash
# Configurar en .env:
COMPOSE_FILE=docker-compose.remote.yml

# O especificar el archivo directamente:
docker compose -f docker-compose.remote.yml up

# Modo desacoplado (background)
docker compose -f docker-compose.remote.yml up -d

# Reconstruir imágenes
docker compose -f docker-compose.remote.yml up --build
```

**Requisitos previos:**

1. Actualiza tu archivo `.env` con la conexión a QuestDB del VPS:

   ```env
   QUESTDB_HOST=tu-ip-o-hostname-vps
   QUESTDB_PORT=8812
   QUESTDB_USER=admin
   QUESTDB_PASSWORD=tu_contraseña
   ```

2. Asegúrate de que los puertos de QuestDB en el VPS sean accesibles:
   - `8812` - Protocolo PostgreSQL wire (requerido)
   - `9000` - Consola web/REST API (opcional, para debugging)
   - `9009` - Protocolo InfluxDB Line (si es necesario)

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Cliente Streamlit**: [http://localhost:8501](http://localhost:8501)

### Opción 3: Docker con Soporte GPU

El servicio `app` puede utilizar GPU para acelerar el procesamiento. Para habilitar GPU:

```bash
# Usando variable de entorno (en .env):
# Linux/macOS:
COMPOSE_FILE=docker-compose.yml:docker-compose.gpu.yml

# Windows:
COMPOSE_FILE=docker-compose.yml;docker-compose.gpu.yml

# O combinando con QuestDB remoto y GPU:
# Linux/macOS:
COMPOSE_FILE=docker-compose.remote.yml:docker-compose.gpu.yml

# Windows:
COMPOSE_FILE=docker-compose.remote.yml;docker-compose.gpu.yml

# O mediante línea de comandos:
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

**Requisitos para GPU:**

- Drivers NVIDIA instalados
- [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

> [!IMPORTANT]
> **Nota sobre el separador de `COMPOSE_FILE`**:
>
> - En **Linux/macOS** se utiliza el signo de dos puntos (`:`) como separador.
> - En **Windows** se debe utilizar el punto y coma (`;`) como separador.

### Opción 4: Desarrollo Local

#### Cliente Python

```bash
# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar script de inicio
./run.sh
```

#### Dashboard (Next.js)

```bash
cd dashboard

# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo
pnpm dev
```

El dashboard estará disponible en `http://localhost:3001`.

## Estructura del Proyecto

```
ASM2-client/
├── dashboard/              # Código fuente de la aplicación Next.js
├── src/                    # Código fuente del cliente Python
├── sql/                    # Scripts de inicialización de base de datos
├── secrets/                # Credenciales y ficheros sensibles
├── img/                    # Imágenes y assets
├── faiss_index/           # Índices FAISS (generado en runtime)
├── questdb/               # Datos persistentes de QuestDB (generado)
├── docker-compose.yml     # Stack completo local
├── docker-compose.remote.yml  # Configuración para QuestDB remoto
├── docker-compose.gpu.yml # Override para soporte GPU
├── .env.example           # Plantilla de variables de entorno
└── Dockerfile             # Imagen del cliente Python
```

---

<div align="center">
    <img src="img/LOGOS.png" width="800" alt="Logos de financiación IGAPE, Xunta de Galicia y NextGenerationEU">
    <p><i>Este proyecto ha sido financiado por el Instituto Galego de Promoción Económica (IGAPE) y la Xunta de Galicia en el marco del Plan de Recuperación, Transformación y Resiliencia, financiado por la Unión Europea – NextGenerationEU, dentro del procedimiento IG408M (“Ayudas para el desarrollo tecnológico y la innovación mediante el uso de la Inteligencia Artificial – IA360”).</i></p>
</div>
