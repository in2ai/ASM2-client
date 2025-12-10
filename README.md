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
- Integración con el resto de servicios del nodo central.

## Arquitectura

El sistema se despliega mediante contenedores Docker orquestados:

- **`app`**: Servicio de Streamlit (Python).
- **`questdb`**: Base de datos Time-Series.
- **`dashboard`**: Aplicación Next.js para métricas y administración.
- **`questdb-init`**: Contenedor efímero para inicialización de esquemas.

## Requisitos

- **Docker** y **Docker Compose** (Recomendado para despliegue).
- **Python 3.9+** (Para desarrollo local del cliente).
- **Node.js 18+** y **pnpm** (Para desarrollo local del dashboard).

## Configuración

El proyecto requiere un archivo `.env` en la raíz.

Además, para el **desarrollo local del Dashboard**, debes crear un archivo `.env.local` en la carpeta `dashboard/` para asegurar la conexión a la base de datos (que se ejecuta en Docker pero se accede via `localhost`):

```env
QUESTDB_HOST=localhost
```

Crea un archivo `.env` basado en los ejemplos proporcionados. Las variables clave incluyen:

**Credenciales y API:**

- `OPENAI_API_KEY`: Clave de API para los modelos.
- `FOLDER_ID`: ID de carpeta para almacenamiento (si aplica).

**QuestDB:**

- `QUESTDB_HOST`, `QUESTDB_PORT`, `QUESTDB_USER`, `QUESTDB_PASSWORD`, `QUESTDB_DB`.

**WorkOS (Autenticación Dashboard):**

- `WORKOS_API_KEY`: API Key de WorkOS.
- `WORKOS_CLIENT_ID`: Client ID de la aplicación.
- `WORKOS_COOKIE_PASSWORD`: Contraseña segura para encriptación de cookies.
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI`: URI de redirección (ej. `http://localhost:3001/api/auth/callback`).

> **Nota:** Asegúrate de tener los archivos de secrets (`client_secret.json`, etc.) en la carpeta `secrets/` si son requeridos por el cliente Python.

## Instalación y Uso

### Opción 1: Docker (Recomendada)

Levanta todos los servicios con un solo comando:

```bash
docker-compose up --build
```

Esto iniciará:

- **Dashboard**: [http://localhost:3001](http://localhost:3001)
- **Cliente Streamlit**: [http://localhost:8501](http://localhost:8501)
- **Consola QuestDB**: [http://localhost:9000](http://localhost:9000)

### Opción 2: Desarrollo Local

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

- `src/`: Código fuente del cliente Python.
- `dashboard/`: Código fuente de la aplicación Next.js.
- `questdb/`: Datos persistentes de la base de datos (generado al ejecutar).
- `sql/`: Scripts de inicialización de base de datos.
- `secrets/`: Credenciales y ficheros sensibles.
