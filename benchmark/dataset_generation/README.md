# Generación de datasets del benchmark

Este directorio contiene los scripts que generan el dataset de evaluación de ASM2.
El dataset final se construye a partir de dos fuentes —**NarrativeQA** y **SQuAD 2.0**—
que primero se procesan por separado y luego se combinan en un único CSV que se guarda
en [`benchmark/data`](../data).

Todos los datasets comparten el mismo esquema de columnas:

| Columna | Descripción |
| --- | --- |
| `evaluation_id` | Id numérico secuencial, empezando en 1. |
| `source` | Origen de los datos (`narrativeqa` o `squad2.0`). Permite trazar cada pregunta a su fuente. |
| `document_id` | Identificador del documento (coincide con el nombre del `.txt` del corpus). |
| `question` | Texto de la pregunta (una por fila). |
| `answer1` | Texto de la respuesta (si hay varias, se usa la primera). |

## Estructura

```
dataset_generation/
├── merge_datasets.py                    # Une los dos datasets y guarda el resultado en benchmark/data
├── narrativeqa/
│   ├── dataset_generation_narrativeqa.py
│   ├── download_stories.sh
│   ├── asm2-narrativeqa-documents.csv   # INPUT (descargar de Hugging Face)
│   └── asm2-narrativeqa-qaps.csv        # INPUT (descargar de Hugging Face)
└── squad2.0/
    ├── dataset_generation_squad2.0.py
    └── asm2-squad-train-v2.0.json       # INPUT (descargar de Hugging Face)
```

> **Archivos de entrada**
> Los archivos de entrada no se versionan en el repositorio por su tamaño.
> Se pueden descargar desde el repositorio de Hugging Face de In2AI:
> **https://huggingface.co/In2AI/datasets**

---

## 1. NarrativeQA

Script: [`narrativeqa/dataset_generation_narrativeqa.py`](narrativeqa/dataset_generation_narrativeqa.py)

### Archivos de entrada

Descargar desde [Hugging Face](https://huggingface.co/In2AI/datasets) y colocar en
`benchmark/dataset_generation/narrativeqa/`:

- `asm2-narrativeqa-documents.csv` — metadatos de los documentos (id, tipo, URL, título, etc.).
- `asm2-narrativeqa-qaps.csv` — pares pregunta/respuesta asociados a cada documento.

### Pasos de generación

1. **Refinado de documentos** (`refine_documents`): filtra los documentos para quedarse
   solo con los de tipo `gutenberg` y genera `refined_documents.csv` (intermedio).
2. **Descarga de historias** (`download_stories_verified` → [`download_stories.sh`](narrativeqa/download_stories.sh)):
   descarga los textos completos en `narrativeqa/corpus/`. Verifica el tamaño de cada
   archivo contra el esperado y reintenta los que difieran ≥ 30 % (hasta 5 reintentos).
3. **Recorte de textos** (`process_txts`): elimina las cabeceras/pies legales de
   Project Gutenberg, conservando solo el texto entre los marcadores `*** START` y `*** END`.
4. **Limpieza por tamaño** (`delete_small_txt_files`): borra los `.txt` de menos de 100 KB
   para quedarse solo con documentos con suficiente contenido.
5. **Generación del QA** (`generate_qa_dataset`): a partir de `asm2-narrativeqa-qaps.csv`,
   muestrea hasta 5 preguntas por documento (máx. 200 documentos), añade el `evaluation_id`,
   antepone el título del libro a cada pregunta y etiqueta `source = narrativeqa`.
6. **Limpieza de intermedios** (`delete_auxiliary_files`): borra `refined_documents.csv`
   y `refined_documents_id_url.csv`.

### Salida

`narrativeqa/dataset_narrativeqa_qa_5_docs_200.csv`

### Ejecución

```bash
python benchmark/dataset_generation/narrativeqa/dataset_generation_narrativeqa.py
```

---

## 2. SQuAD 2.0

Script: [`squad2.0/dataset_generation_squad2.0.py`](squad2.0/dataset_generation_squad2.0.py)

### Archivo de entrada

Descargar desde [Hugging Face](https://huggingface.co/In2AI/datasets) y colocar en
`benchmark/dataset_generation/squad2.0/`:

- `asm2-squad-train-v2.0.json` — dataset SQuAD 2.0 en formato JSON.

### Pasos de generación

1. **Indentado del JSON** (`indent_json`): reescribe el JSON con indentación en
   `asm2-squad-train-v2.0-indented.json` (intermedio).
2. **Generación del corpus** (`generate_txt`): crea un `.txt` por cada título/artículo
   en `squad2.0/corpus/`, con sus contextos. Sanea los títulos para usarlos como nombres
   de archivo válidos.
3. **Generación del QA** (`generate_dataset`): toma los primeros 200 documentos y muestrea
   hasta 5 preguntas **respondibles** (`is_impossible == False`) por documento, con semilla
   fija (`seed = 42`). Añade el `evaluation_id` y etiqueta `source = squad2.0`.
4. **Limpieza de intermedios** (`delete_auxiliary_files`): borra
   `asm2-squad-train-v2.0-indented.json`.

### Salida

`squad2.0/dataset_squad2.0_qa_5_docs_200.csv`

### Ejecución

```bash
python benchmark/dataset_generation/squad2.0/dataset_generation_squad2.0.py
```

---

## 3. Unión de los datasets

Script: [`merge_datasets.py`](merge_datasets.py)

Una vez generados los dos CSV, `merge_datasets.py` los combina en uno solo:

- Coloca **SQuAD 2.0** arriba y **NarrativeQA** debajo.
- Verifica que ambos tengan exactamente las mismas columnas.
- Renumera el `evaluation_id` del segundo dataset para que continúe la numeración del
  primero (sin huecos ni solapamientos).

### Entrada

- `squad2.0/dataset_squad2.0_qa_5_docs_200.csv`
- `narrativeqa/dataset_narrativeqa_qa_5_docs_200.csv`

### Salida

El dataset final se guarda en **[`benchmark/data/dataset_asm2.csv`](../data/dataset_asm2.csv)**.

### Ejecución

```bash
python benchmark/dataset_generation/merge_datasets.py
```

---

## Flujo completo

```
asm2-narrativeqa-documents.csv ┐
asm2-narrativeqa-qaps.csv      ┴─► dataset_narrativeqa_qa_5_docs_200.csv ┐
                                                                         ├─► benchmark/data/dataset_asm2.csv
asm2-squad-train-v2.0.json ───────► dataset_squad2.0_qa_5_docs_200.csv ──┘
```

> **Nota:** los scripts usan rutas relativas a la raíz del repositorio, por lo que deben
> ejecutarse desde la raíz del proyecto (`ASM2-client/`).
