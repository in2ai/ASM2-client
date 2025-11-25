# ASM Client

## Sobre el proyecto

Este repositorio contiene el código para los clientes de ASM. Esto incluye los siguientes módulos:

- Una interfaz de **Streamlit** que permite interactuar con un modelo de lenguaje (_LLM_) con acceso a un RAG protegido con credenciales.
- Una base de datos vectorial que permite hacer búsquedas semánticas para dar contexto al modelo de lenguaje desde diferentes fuentes (Dropbox, Google Drive y Onedrive).
- Una base de datos **QuestDB** que almacena métricas de uso y permite encontrar puntos de mejora en el sistema.

## Usar el cliente

La manera más sencilla de usar el cliente es usando _docker-compose_:

```
docker compose up --build

// Alternativamente, si se dispone de una consola compatible
./run.sh
```

