# Benchmark del RAG de ASM2

Este directorio contiene la **evaluación end-to-end** del sistema RAG de ASM2. Para cada
pregunta del dataset de evaluación, el benchmark ejecuta el grafo RAG *real* (el mismo que
usa la aplicación), captura la respuesta generada y los chunks recuperados, y puntúa el
resultado con métricas de [RAGAS](https://docs.ragas.io/).

La orquestación vive en [`backend/benchmark.py`](../backend/benchmark.py).

---

## 1. Visión general de una ejecución

1. `main()` ejecuta `NUM_EVALUATIONS` intentos completos del benchmark.
2. Cada intento (`run_evaluation`) lee el dataset, opcionalmente lo filtra por fuente, y
   procesa las preguntas en **lotes** de `BATCH_SIZE`, ejecutando en paralelo las preguntas
   de un mismo lote.
3. Para cada pregunta (`process_row`):
   - Se invoca el grafo RAG con la pregunta (`call_rag`).
   - Se capturan la respuesta, si hubo o no retrieval, y los chunks recuperados.
   - Se puntúa la respuesta con las métricas RAGAS (`eval_dataset`), corriendo cada métrica
     en paralelo con sus propios reintentos.
   - Ante cualquier fallo, la pregunta completa se reintenta hasta `MAX_RETRIES` veces con
     backoff exponencial.
4. Las filas y los tiempos de cada pregunta se van añadiendo a los CSV conforme se completan.
5. Tras todos los lotes, los resultados se ordenan y se agregan en un **resumen** por fuente
   (`summarize_evaluation`).

---

## 2. El dataset

El dataset de evaluación se encuentra en
[`benchmark/data/dataset_asm2.csv`](data/dataset_asm2.csv). Cada fila es una pregunta con su
respuesta de referencia y las columnas:

| Columna | Descripción |
| --- | --- |
| `evaluation_id` | Id numérico secuencial, empezando en 1, sin huecos. |
| `source` | Origen de los datos (`narrativeqa` o `squad2.0`). Permite trazar cada pregunta a su fuente y filtrar el benchmark por fuente. |
| `document_id` | Identificador del documento. |
| `question` | Texto de la pregunta (una por fila). |
| `answer1` | Respuesta de referencia. La usa RAGAS como `reference`. |

Cómo se genera este dataset (fuentes, descarga, muestreo y unión) se explica en detalle en el
[README de generación de datasets](dataset_generation/README.md).

---

## 3. Variables parametrizables

Estas son las variables que cambian el comportamiento del benchmark. Todas viven en
[`backend/benchmark.py`](../backend/benchmark.py).

| Variable | Efecto |
| --- | --- |
| `BENCHMARK_SOURCES` | Lista de fuentes a evaluar: `["squad2.0"]`, `["narrativeqa"]`, ambas, o `[]` = **todas las presentes en el CSV**. Se valida contra las fuentes que existen en el dataset (lanza error si hay alguna desconocida). Además determina el sufijo con el que se nombran los ficheros de salida. |
| `NUM_EVALUATIONS` | Número de intentos completos del benchmark. Cada intento genera sus propios ficheros de salida; útil para medir la varianza entre ejecuciones. |
| `BATCH_SIZE` | Preguntas procesadas en paralelo por lote. |
| `MAX_RETRIES` | Máximo de reintentos por pregunta ante un error, con backoff exponencial limitado a 30 s. |
| `EVAL_LLM` | El LLM **juez** que calcula las métricas. Por defecto `Llama-3.3-70B-Instruct-Turbo` de Together. |
| `EVAL_EMBEDDINGS` | Modelo de embeddings que usa `answer_relevancy` (OpenAI `text-embedding-3-small`). |

---

## 4. Métricas y salidas

### 4.1 Qué se mide

Cuatro métricas de RAGAS:

| Métrica | Mide | ¿Necesita contexto recuperado? |
| --- | --- | --- |
| `context_precision` | ¿Son relevantes / están bien rankeados los chunks recuperados frente a la respuesta de referencia? | Sí |
| `context_recall` | ¿El contexto recuperado cubre la respuesta de referencia? | Sí |
| `faithfulness` | ¿La respuesta generada está fundamentada en el contexto recuperado (sin alucinar)? | Sí |
| `answer_relevancy` | ¿La respuesta es relevante para la pregunta? | No (siempre se calcula) |

### 4.2 Lógica de retrieval (qué métricas se calculan)

Para cada pregunta el benchmark distingue tres casos:

- **Sin retrieval** (`retrieval = 0`): el agente respondió sin llamar a `vectordb_search`.
  Solo se calcula `answer_relevancy`; las métricas de contexto quedan vacías.
- **Con retrieval pero sin chunks relevantes** (`retrieval = 1`, 0 chunks): las métricas de
  contexto se registran como `0.0`.
- **Con retrieval y con chunks**: se calculan las cuatro métricas.

### 4.3 Ficheros de salida

Todos bajo `benchmark/results/`. Los nombres llevan un sufijo construido a partir de las
fuentes evaluadas y el número de intento:

| Fichero | Contenido |
| --- | --- |
| `rag_evaluation_results_<fuentes>_attempt_<n>.csv` | Una fila por pregunta: las cuatro métricas, el flag `answered`, el flag `retrieval` y la respuesta generada. |
| `query_timings_<fuentes>_attempt_<n>.csv` | Tiempo empleado por pregunta. |
| `batch_timings_<fuentes>_attempt_<n>.csv` | Tiempo empleado por lote. |
| `rag_evaluation_summary_<fuentes>.csv` | Agregados por fuente (medias de las métricas, número de respondidas / no respondidas, tiempo medio por pregunta y por lote); se añade un bloque por intento. |

`<fuentes>` es la lista de `BENCHMARK_SOURCES` ordenada y unida por `-` (o `all` si está vacía).
