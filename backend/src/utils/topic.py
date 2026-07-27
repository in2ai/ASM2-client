import igraph as ig
import random
import json
import logging
import os
from typing import Iterable

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document

from qdrant_client.http import models

from src.config.env import get_bool_env, get_float_env
from src.config.config import APPROX_SEARCH_PARAMS
from src.utils.nlp import SUPPORTED_LANGUAGES


TOPIC_RESOLUTION = get_float_env("TOPIC_RESOLUTION", 0.025)
TOPIC_MIN_CONTRIB = get_float_env("TOPIC_MIN_CONTRIB", 0.3)
TOPIC_MAPPING_FILENAME = "topics.json"
CALCULATE_TOPICS = get_bool_env("CALCULATE_TOPICS")


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


def save_topic_mapping(vdb_path: str, mapping: dict, pool=None) -> None:
    os.makedirs(vdb_path, exist_ok=True)
    path = get_topic_mapping_path(vdb_path)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    if pool is not None:
        from src.metrics.metrics import register_topic_intl

        register_topic_intl(pool, mapping)


def resolve_topic_names(
    topic_indices: Iterable[int], lang_code: str, vdb_path: str
) -> dict[str, str]:
    mapping = load_topic_mapping(vdb_path)

    if not mapping:
        return {str(idx): str(idx) for idx in topic_indices}

    lang_map = mapping.get(lang_code) or mapping.get("es") or {}
    fallback_map = mapping.get("es", {})
    resolved = {}

    for idx in topic_indices:
        key = str(idx)
        name = None

        if isinstance(lang_map, dict):
            name = lang_map.get(key)

        if not name and isinstance(fallback_map, dict):
            name = fallback_map.get(key)

        resolved[key] = name if name else str(idx)

    return resolved


def get_doc_by_id(vdb: Qdrant, id):
    point = vdb.client.retrieve(
        collection_name=vdb.collection_name,
        ids=[id],
        with_payload=True,
    )[0]

    payload = point.payload or {}

    return Document(
        page_content=payload.get("page_content", ""),
        metadata=payload.get("metadata", ""),
    )


def extract_initial_topics(llm, vdb: Qdrant, vdb_path: str, pool=None):
    if not CALCULATE_TOPICS:
        return
    
    logging.info('Executing topic extraction...')

    # Iteration variables
    batch_size = 1024
    min_cosine = 0.3

    ids = []
    edges = []
    offset = None

    logging.info('Generating similarity graph...')

    # Total number of points in the collection
    total_points = vdb.client.count(
        collection_name=vdb.collection_name,
        exact=True,
    ).count

    processed = 0
    next_log = 1  # Next percentage to log

    while True:
        batch, offset = vdb.client.scroll(
            collection_name=vdb.collection_name,
            offset=offset,
            limit=batch_size,
            with_payload=False,
            with_vectors=True,
            timeout=600
        )

        requests = [
            models.QueryRequest(
                query=i.vector['embedding'],
                using='embedding',
                limit=200,
                with_payload=False,
                with_vector=False,
                params=APPROX_SEARCH_PARAMS
            )
            for i in batch
        ]

        hits = vdb.client.query_batch_points(
            vdb.collection_name,
            requests,
            timeout=600
        )

        for point, nearest in zip(batch, hits):
            ids.append(point.id)

            for n in nearest.points:
                if n.id == point.id:
                    continue  # skip self-loops

                if n.score < min_cosine:
                    continue  # skip neighbors beyond threshold

                edges.append((point.id, n.id))

        # Log progress
        processed += len(batch)
        progress = (processed * 100) // total_points

        while progress >= next_log:
            logging.info("Similarity graph progress: %d%% (%d/%d)", next_log, processed, total_points)
            next_log += 1

        if offset is None:
            break

    logging.info("Similarity graph progress: 100%% (%d/%d)", processed, total_points)

    # Construct graph
    num_vectors = vdb.client.count(vdb.collection_name).count
    id_to_idx = {j: i for i, j in enumerate(ids)}

    edges = [(id_to_idx[i], id_to_idx[j]) for i, j in edges]
    edges = list({(min(a, b), max(a, b)) for a, b in edges})

    g = ig.Graph(n=num_vectors, edges=edges, directed=False)
    g.vs["name"] = ids

    # Calculate communities
    logging.info('Clustering entries...')

    communities = g.community_leiden(resolution=TOPIC_RESOLUTION)

    # Calculate representative docs
    logging.info('Clarifying topic names...')

    topics = {}
    topic_mapping = {lang: {} for lang in SUPPORTED_LANGUAGES}
    topic_index = 0

    for members in communities:
        if not members or len(members) < 100:
            continue

        sample_count = 20
        sampled = random.sample(members, sample_count)
        comm_samples = [ids[int(i)] for i in sampled]

        texts = []

        for sample in comm_samples:
            doc = get_doc_by_id(vdb, sample)
            texts.append(doc.page_content)

        topic_json = get_topic(llm, texts)

        if topic_json is None:
            continue

        topic_names = topic_json.get("Tema")
        if isinstance(topic_names, str):
            topic_names = {lang: topic_names for lang in SUPPORTED_LANGUAGES}
        if not isinstance(topic_names, dict):
            continue

        for lang in SUPPORTED_LANGUAGES:
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

        for m in members:
            m_id = ids[m]
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
    logging.info('Updating VDB metadata...')


    for id, ts in aggregated_topics.items():
        # Transform ints to strings for Qdrant compatibility reasons
        topics_str_keys = {str(k): v for k, v in ts.items()}
        vdb.client.set_payload(
            collection_name=vdb.collection_name,
            key='metadata',
            payload={'topics': topics_str_keys},
            points=[id]
        )

    save_topic_mapping(vdb_path, topic_mapping, pool)

    logging.info('Finished topic extraction')

    return communities


def assign_topics(vdb: Qdrant, ids):
    if not CALCULATE_TOPICS:
        return

    min_cosine = 0.3

    requests = [
        models.QueryRequest(
            query=i,
            using='embedding',
            limit=200,
            with_payload=True,
            with_vector=False,
            params=APPROX_SEARCH_PARAMS
        )
        for i in ids
    ]

    hits = vdb.client.query_batch_points(
        vdb.collection_name,
        requests
    )

    # Get topic connections
    for point, nearest in zip(ids, hits):
        n_topics = []

        for n in nearest.points:
            if n.id == point:
                continue  # skip self-loops

            if n.score < min_cosine:
                continue  # skip neighbors beyond threshold

            if 'topics' in n.payload['metadata']:
                n_topics.append(n.payload['metadata']['topics'])

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
        topics_dict = {}

        for t, weight in topics.items():
            if weight >= TOPIC_MIN_CONTRIB:
                topics_dict[t] = weight

        # Save chunk to VDB
        vdb.client.set_payload(
            collection_name=vdb.collection_name,
            key='metadata',
            payload={'topics': topics_dict},
            points=[point]
        )


def get_topic(llm, texts):
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
            ans = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content
            res = json.loads(ans)

        except json.JSONDecodeError:
            pass

        except Exception:
            break

    return res
