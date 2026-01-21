import igraph as ig
import random
import json
import os

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_community.vectorstores import Qdrant
from langchain.schema import Document

from qdrant_client.http import models


TOPIC_RESOLUTION = float(os.getenv("TOPIC_RESOLUTION", 0.025))
TOPIC_MIN_CONTRIB = float(os.getenv("TOPIC_MIN_CONTRIB", 0.3))
CALCULATE_TOPICS = os.getenv("CALCULATE_TOPICS", '') == 'True'


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
    

def extract_initial_topics(vdb: Qdrant):
    if not CALCULATE_TOPICS:
        print("La detección de temas está desactivada")
        return

    # Iteration variables
    batch_size = 1024
    min_cosine = 0.3

    ids = []
    edges = []
    offset = None

    while True:
        batch, offset = vdb.client.scroll(
            collection_name=vdb.collection_name,
            offset=offset,
            limit=batch_size,
            with_payload=False,
            with_vectors=True
        )

        requests = [
            models.QueryRequest(
                query=i.vector['embedding'], 
                using='embedding',
                limit=200,
                with_payload=False,
                with_vector=False,
                params=models.SearchParams(hnsw_ef=256, exact=False)
            )
            for i in batch
        ]

        hits = vdb.client.query_batch_points(
            vdb.collection_name, 
            requests
        )

        for point, nearest in zip(batch, hits):
            ids.append(point.id)

            for n in nearest.points:
                if n.id == point.id:
                    continue  # skip self-loops

                if n.score < min_cosine:
                    continue  # skip neighbors beyond threshold

                edges.append((point.id, n.id))

        if offset is None:
            break

    # Construct graph
    num_vectors = vdb.client.count(vdb.collection_name).count
    id_to_idx = {j: i for i, j in enumerate(ids)}

    edges = [(id_to_idx[i], id_to_idx[j]) for i, j in edges]
    edges = list({(min(a, b), max(a, b)) for a, b in edges})

    g = ig.Graph(n=num_vectors, edges=edges, directed=False)
    g.vs["name"] = ids

    # Calculate communities
    communities = g.community_leiden(resolution=TOPIC_RESOLUTION)

    # Calculate representative docs
    topics = {}

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

        topic_json = get_topic(texts)

        if topic_json is None:
            continue

        topic_name = topic_json['Tema']

        print(f'Topic: {topic_name}')

        for m in members:
            m_id = ids[m]
            topics.setdefault(m_id, [])
            topics[m_id].append(topic_name)

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
        vdb.client.set_payload(
            collection_name=vdb.collection_name,
            key='metadata',
            payload={'topics': ts},
            points=[id]
        )

    return communities


def assign_topics(vdb: Qdrant, ids):
    if not CALCULATE_TOPICS:
        print("La detección de temas está desactivada")
        return
    
    min_cosine = 0.3

    requests = [
        models.QueryRequest(
            query=i,
            using='embedding',
            limit=200,
            with_payload=True,
            with_vector=False,
            params=models.SearchParams(hnsw_ef=256, exact=False)
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


def get_topic(texts):
    system = """
    Eres un asistente que dados una serie de fragmentos de textos tiene que decidir un tema general para los mismos en un contexto de empresa.
    Los textos pueden estar en múltiples idiomas, pero el tema resultante siempre tiene que estar en español y debe hacer alusión al contenido, no a la forma.
    la respuesta debe ser únicamente un JSON válido con la siguiente forma:

    {
        "Tema": "Tema de los textos (Ejemplos: Recursos Humanos, Contabilidad, Ingeniería de Software, ...)",
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