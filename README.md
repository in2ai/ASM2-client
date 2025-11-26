# ASM2-Client 📊

<div align="center">
    <img src="img/in2ai slogan.png" width="300">
</div>

## Descripción
`ASM2-Client` corresponde a la parte cliente del sistema distribuido desarrollado por In2AI para gestión documental, RAG (Retrieval-Augmented Generation) y métricas de uso.
El objetivo es ofrecer un cliente robusto y modular capaz de:
- Extraer métricas de uso (uso de modelos, consultas, autenticaciones, etc.).
- Almacenarlas localmente usando una base de datos de series temporales.
- Enviar agregados al servidor central bajo demanda.
- Compatibilizar con el resto de servicios del nodo (UI, almacenamiento documental, RAG, LLM).
Este componente es clave dentro de la arquitectura distribuida del sistema, pues permite monitorizar su uso, rendimiento y adopción, facilitando analíticas y mantenimiento en entornos productivos.
## Requisitos
- Python 3.9+
- Docker + Docker Compose (opcional, para despliegue en contenedores)
- Acceso a los servicios externos (repositorios de almacenamiento, nodo central, etc.) si se desea test completo de integración

## Instalación
```bash
git clone https://github.com/in2ai/ASM2-client.git
cd ASM2-client

# Si usas virtualenv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Si prefieres usar Docker (recomendado para entornos consistentes)
docker-compose up --build

# O alternativamente
./run.sh
```