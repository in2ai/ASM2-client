import igraph as ig
import numpy as np
import math
import random
import json
import os
from typing import Iterable

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_community.vectorstores import FAISS

TOPIC_RESOLUTION = float(os.getenv("TOPIC_RESOLUTION", 0.025))
TOPIC_MIN_CONTRIB = float(os.getenv("TOPIC_MIN_CONTRIB", 0.3))
TOPIC_MAPPING_FILENAME = "topics.json"
SUPPORTED_TOPIC_LANGS = ["es", "en", "gl"]


def get_topic_mapping_path(vdb_path: str) -> str:
    return os.path.join(vdb_path, TOPIC_MAPPING_FILENAME)


def load_topic_mapping(vdb_path: str) -> dict:
    path = get_topic_mapping_path(vdb_path)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_topic_mapping(vdb_path: str, mapping: dict) -> None:
    os.makedirs(vdb_path, exist_ok=True)
    path = get_topic_mapping_path(vdb_path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)


def resolve_topic_names(
    topic_indices: Iterable[int], lang_code: str, vdb_path: str
) -> set[str]:
    mapping = load_topic_mapping(vdb_path)
    if not mapping:
        return {str(idx) for idx in topic_indices}

    lang_map = mapping.get(lang_code) or mapping.get("es") or {}
    fallback_map = mapping.get("es", {})
    resolved = set()

    for idx in topic_indices:
        key = str(idx)
        name = None
        if isinstance(lang_map, dict):
            name = lang_map.get(key)
        if not name and isinstance(fallback_map, dict):
            name = fallback_map.get(key)
        resolved.add(name if name else str(idx))

    return resolved

def extract_initial_topics(vdb: FAISS, vdb_path: str):
    # Iteration variables
    num_vectors = vdb.index.ntotal
    batch_size = 1024
    min_cosine = 0.3

    d = vdb.index.d
    n_batches = math.ceil(num_vectors / batch_size)
    edges = []

    for b in range(n_batches):
        # Batch limits
        start = b * batch_size
        end = min(num_vectors, start + batch_size)
        qsize = end - start

        # Search vectors
        queries = np.empty((qsize, d), dtype=np.float32)
        vdb.index.reconstruct_n(start, qsize, queries)
        D, I = vdb.index.search(queries, k=200)

        # Add edges to list
        for row_idx, (distances, neighbors) in enumerate(zip(D, I)):
            src_idx = start + row_idx
            for dist, c in zip(distances, neighbors):
                if c == src_idx:
                    continue  # skip self-loops
                if dist < min_cosine:
                    continue  # skip neighbors beyond threshold
                edges.append((int(src_idx), int(c)))


    # Construct graph
    edges = list({(min(a, b), max(a, b)) for a, b in edges})

    g = ig.Graph(n=num_vectors, edges=edges, directed=False)

    idx_to_doc = [vdb.index_to_docstore_id[i] for i in range(num_vectors)]
    g.vs["name"] = idx_to_doc

    # Calculate communities
    communities = g.community_leiden(resolution=TOPIC_RESOLUTION)

    # Calculate representative docs
    topics = {}
    topic_mapping = {lang: {} for lang in SUPPORTED_TOPIC_LANGS}
    topic_index = 0

    for members in communities:
        if not members or len(members) < 100:
            continue

        sample_count = 20
        sampled = random.sample(members, sample_count)
        comm_samples = [idx_to_doc[int(i)] for i in sampled]

        texts = []

        for sample in comm_samples:
            doc = vdb.docstore.search(sample)
            texts.append(doc.page_content)

        topic_json = get_topic(texts)

        if topic_json is None:
            continue

        topic_names = topic_json.get("Tema")
        if isinstance(topic_names, str):
            topic_names = {lang: topic_names for lang in SUPPORTED_TOPIC_LANGS}
        if not isinstance(topic_names, dict):
            continue

        for lang in SUPPORTED_TOPIC_LANGS:
            name = topic_names.get(lang) if isinstance(topic_names, dict) else None
            if not name:
                name = topic_names.get("es")
            if not name:
                name = next(
                    (
                        v
                        for v in topic_names.values()
                        if isinstance(v, str) and v.strip()
                    ),
                    None,
                )
            if not name:
                name = f"Topic {topic_index}"
            topic_mapping[lang][str(topic_index)] = name

        print(f'Topic: {topic_mapping.get("es", {}).get(str(topic_index))}')

        for m in members:
            m_id = idx_to_doc[m]
            topics.setdefault(m_id, [])
            topics[m_id].append(topic_index)

        topic_index += 1

    # Calculate multiple topics
    aggregated_topics = {}

    for v in g.vs:
        topics_repr = {}
        ns = g.neighbors(v)

        if not ns:
            continue

        contrib = 1.0 / len(ns)

        # Calculate topic contributions
        for n in ns:
            n_name = g.vs[n]["name"]
            n_topics = topics.get(n_name, [])

            for topic in n_topics:
                topics_repr.setdefault(topic, 0)
                topics_repr[topic] += contrib

        # Anything over the min rep is also representative
        v_name = v["name"]

        for t, weight in topics_repr.items():
            aggregated_topics.setdefault(v_name, {})

            if weight >= TOPIC_MIN_CONTRIB:
                aggregated_topics[v_name][t] = max(weight, aggregated_topics[v_name].get(t, 0.0))

    # Update metadata
    for id, ts in aggregated_topics.items():
        doc = vdb.docstore.search(id)
        doc.metadata['topics'] = ts 

    save_topic_mapping(vdb_path, topic_mapping)

    return communities


def assign_topics(vdb: FAISS, ids):
    print("Assigning topics...")
    # Get embeddings
    d = vdb.index.d
    num_vectors = vdb.index.ntotal
    qsize = len(ids)

    embs = np.empty((qsize, d), dtype=np.float32)
    vdb.index.reconstruct_n(num_vectors - qsize, qsize, embs)

    # Get topic connections
    min_cosine = 0.3

    D, I = vdb.index.search(embs, k=200)

    for row_idx, (distances, neighbors) in enumerate(zip(D, I)):
        abs_idx = num_vectors - qsize + row_idx
        n_topics = []

        for dist, c in zip(distances, neighbors):
            if c == abs_idx:
                continue  # skip self-loops
            if dist < min_cosine:
                continue  # skip neighbors beyond threshold

            n_id = vdb.index_to_docstore_id[c]
            doc = vdb.docstore.search(n_id)

            if 'topics' in doc.metadata:
                n_topics.append(doc.metadata['topics'])

        # Ensure enough neighbors with topics
        if len(n_topics) < 20:
            continue

        # Calculate final topic contribs
        topics = {}
        contrib = 1.0 / len(n_topics)

        for ts in n_topics:
            for t, weight in ts.items():
                topics.setdefault(t, 0.0)
                topics[t] += weight * contrib

        # Assign topics to chunk
        doc = vdb.docstore.search(vdb.index_to_docstore_id[abs_idx])
        doc.metadata['topics'] = {}

        for t, weight in topics.items():
            if weight >= TOPIC_MIN_CONTRIB:
                doc.metadata['topics'][t] = weight


def get_topic(texts):
    system = """
    Eres un asistente que dados una serie de fragmentos de textos tiene que decidir un tema general para los mismos en un contexto de empresa.
    Los textos pueden estar en múltiples idiomas. Devuelve el nombre del tema en español, inglés y gallego, y debe hacer alusión al contenido, no a la forma.
    la respuesta debe ser únicamente un JSON válido con la siguiente forma:

    {
        "Tema": {
            "es": "Tema de los textos (Ejemplos: Recursos Humanos, Contabilidad, Ingeniería de Software, ...)",
            "en": "Topic of the texts (Examples: Human Resources, Accounting, Software Engineering, ...)",
            "gl": "Tema dos textos (Exemplos: Recursos Humanos, Contabilidade, Enxeñaría de Software, ...)"
        },
        "Razonamiento": "Razonamiento corto de por qué se ha elegido ese tema en particular"
    }

    Deber ser claro, directo y razonar adecuadamente. El JSON de tu respuesta no debe estar rodeado de comillas (`) ni markdown, debe ser el JSON en bruto listo para parsear.
    Evita temas compuestos separados por nexos ("Comunicaciones Unificadas y Telefonía IP" son dos temas, no uno).
    """

    user = '\n\n-----------------------\n\n'.join(texts)

    res = None
    tries = 0

    while res is None and tries < 5:
        try:    
            tries += 1
            llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
            ans = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content
            res = json.loads(ans)

        except json.JSONDecodeError:
            pass

        except Exception:
            break

    return res