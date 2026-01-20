from typing import List
import os

import hashlib
import os
import uuid

from qdrant_client import QdrantClient
from qdrant_client.http.models import VectorParams, SparseVectorParams, Modifier, Distance, PointStruct, Filter, MatchAny, FieldCondition, MatchValue, Document as QDocument

from langchain_community.vectorstores import Qdrant
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from pydantic import Field

from src.connectors.vdb_file import VDBFile
from src.connectors.manifest import VDBManifest
from src.utils.topic import assign_topics, extract_initial_topics

QDRANT_PATH = "qdrant_index"
BM25_PATH = "bm25_index"

EMBEDDINGS = OpenAIEmbeddings(model="text-embedding-3-small")
QDRANT_COLL = "documents"

DOCUMENT_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

TOPIC_MIN_SIZE = int(os.getenv("TOPIC_MIN_SIZE", 20000))
CALCULATE_TOPICS = os.getenv("CALCULATE_TOPICS", '') == 'True'

def get_config_hash() -> str:
    """
    Genera un hash de la configuración de chunking.
    Si cambia chunk_size o chunk_overlap, el hash cambia y se fuerza rebuild.
    """
    config = f"chunk_size={DOCUMENT_SPLITTER._chunk_size}_overlap={DOCUMENT_SPLITTER._chunk_overlap}"
    return hashlib.md5(config.encode()).hexdigest()[:8]


def iterate_qdrant_docs(vectorstore: Qdrant, batch_size=100, with_payload=True, with_vectors=False, scroll_filter=None):
    offset = None

    while True:
        points, offset = vectorstore.client.scroll(
            collection_name=QDRANT_COLL,
            offset=offset,
            limit=batch_size,
            with_payload=with_payload,
            with_vectors=with_vectors,
            scroll_filter=scroll_filter
        )

        for p in points:
            payload = p.payload or {}

            page_content = payload.get("page_content", "")
            metadata = payload.get("metadata", {})

            yield p.id, Document(page_content=page_content, metadata=metadata)

        if offset is None:
            break

def build_vectorstore(files: List[VDBFile], source, batch_size=200):
    global QDRANT_PATH, DOCUMENT_SPLITTER, EMBEDDINGS

    # Read status manifest file
    manifest = VDBManifest(QDRANT_PATH)
    current_config_hash = get_config_hash()
    
    # Verificar si la configuración de chunking cambió
    config_changed = manifest.needs_config_rebuild(current_config_hash)
    
    if config_changed:
        print(f"⚠️ ({source}): Configuración de chunking cambió, reconstruyendo índice completo...")

    # Check if the part for this source is already constructed
    client = QdrantClient(
        url="http://qdrant:6333",
        grpc_port=6334,
        prefer_grpc=True,
    )

    vectorstore = Qdrant(client, QDRANT_COLL, EMBEDDINGS)

    # Limpiar manifest si config cambió
    if config_changed:
        manifest.manifest["processed_ids"] = {}
        manifest.manifest["total_chunks"] = 0
        manifest.manifest["completed"] = {}

    if not vectorstore.client.collection_exists(QDRANT_COLL):
        vectorstore.client.create_collection(
            collection_name=QDRANT_COLL,
            vectors_config={
                "embedding": VectorParams(size=1536, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "bm25": SparseVectorParams(modifier=Modifier.IDF),
            },
        )

    # Update file permissions
    for file in files:
        update_file_permissions(vectorstore, file.metadata['id'], file.metadata['permissions'])

    # Check files to update
    current = manifest.get_processed_ids(source)
    new = {f.metadata['id']: f.metadata['modifiedTime'] for f in files}

    files_to_delete = set()
    files_to_add = {id for id in new.keys() if id not in current}

    for id in current.keys():
        if id not in new:
            files_to_delete.add(id)
        
        elif id in new and new[id] != current[id]:
            files_to_add.add(id)
            files_to_delete.add(id)

    # Early return if no changes are needed
    if len(files_to_delete) == 0 and len(files_to_add) == 0:
        print(f"📂 ({source}) El índice no necesita cambios")

        return vectorstore

    # Delete chunks
    id_deletion_filter = Filter(
        must=[FieldCondition(key="metadata.id", match=MatchAny(any=files_to_delete))]
    )

    num_ids_to_delete = vectorstore.client.count(
        collection_name=vectorstore.collection_name,
        count_filter=id_deletion_filter
    ).count

    if num_ids_to_delete > 0:
        manifest.remove_processed_ids(source, files_to_delete)
        manifest.remove_chunks(num_ids_to_delete)

        vectorstore.client.delete(
            collection_name=vectorstore.collection_name,
            points_selector=id_deletion_filter
        )

        manifest.save()

    # Read file chunks in batches
    docs_batch, pending_ids = [], []

    def flush(reason="batch"):
        nonlocal docs_batch, pending_ids, manifest
        if not docs_batch: return

        for i in range(0, len(docs_batch), batch_size):
            sub_docs = docs_batch[i:i + batch_size]
            new_ids = [str(uuid.uuid4()) for _ in sub_docs]
            embs = EMBEDDINGS.embed_documents([i.page_content for i in sub_docs])

            points = [
                PointStruct(
                    id=uuid,
                    vector={
                        "embedding": emb,
                        "bm25": QDocument(text=doc.page_content, model="qdrant/bm25")
                    },
                    payload={
                        "page_content": doc.page_content,
                        "metadata": doc.metadata
                    }
                )

                for uuid, emb, doc in zip(new_ids, embs, sub_docs)
            ]

            vectorstore.client.upsert(
                vectorstore.collection_name,
                points
            )

            if manifest.has_topics():
                assign_topics(vectorstore, new_ids)

        manifest.add_processed_ids(source, pending_ids)
        manifest.add_chunks(len(docs_batch))
        manifest.save()

        print(f"🧩 ({source}) Persistidos {len(docs_batch)} chunks [{reason}]")

        docs_batch, pending_ids = [], []

    for f in files:
        if f.metadata['id'] not in files_to_add:
            continue

        f.metadata['source'] = source

        txt = f.get_text()
        
        if not txt: 
            # We add it to the manifest, since it has been already processed
            manifest.add_processed_ids(source, [(f.metadata['id'], f.metadata["modifiedTime"])])
            manifest.save()
            continue

        base_doc = Document(page_content=txt, metadata=f.metadata)
        chunks = DOCUMENT_SPLITTER.split_documents([base_doc])
        docs_batch.extend(chunks)
        pending_ids.append((f.metadata["id"], f.metadata["modifiedTime"]))

        if len(docs_batch) >= batch_size: 
            flush("lote")

    if docs_batch: 
        flush("final")

    # Update status manifest con el hash de configuración actual
    manifest.add_completed_source(source)
    manifest.set_config_hash(current_config_hash)
    manifest.save()

    print(f"💾 ({source}) Índice guardado en {QDRANT_PATH} [config: {current_config_hash}]")
    
    return vectorstore


def update_file_permissions(vectorstore: Qdrant, file_id, new_permissions):
    # Create file filter
    id_filter = Filter(
        must=[FieldCondition(key="metadata.id", match=MatchValue(value=file_id))]
    )
    
    # Check if the permissions need to be updated
    _, first_doc = next(
        iterate_qdrant_docs(vectorstore, batch_size=1, scroll_filter=id_filter), 
        (None, None)
    )

    if first_doc is None or first_doc.metadata['permissions'] == new_permissions:
        return

    # Update the permissions in batch
    vectorstore.client.set_payload(
        collection_name=vectorstore.collection_name,
        key='metadata',
        payload={'permissions': new_permissions},
        points=id_filter
    )


def extract_topics(vectorstore: Qdrant):
    manifest = VDBManifest(QDRANT_PATH)

    # Add topics if needed
    if not manifest.has_topics():
        if manifest.num_chunks() > TOPIC_MIN_SIZE:
            print(f"💾 Detectando temas...")
            extract_initial_topics(vectorstore)

            if CALCULATE_TOPICS:
                manifest.set_topics()
                manifest.save()
            
        else:
            print(f"El índice es demasiado pequeño para detectar temas")