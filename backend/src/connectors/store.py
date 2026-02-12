import hashlib
import logging
import os
from typing import List
import uuid

from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, FieldCondition, Filter, MatchAny, MatchValue, Modifier, PayloadSchemaType, PointStruct, SparseVectorParams, VectorParams
from qdrant_client.http.models import Document as QDocument

from src.connectors.source import DataSource
from src.connectors.manifest import VDBManifest
from src.connectors.vdb_file import VDBFile
from src.utils.topic import assign_topics, extract_initial_topics

QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant")
QDRANT_PATH = "qdrant_index"
BM25_MODEL = "qdrant/bm25"
VDB_LOCK = 'vdb.lock'

EMBEDDINGS = OpenAIEmbeddings(model="text-embedding-3-small")
QDRANT_COL = "documents"

DOCUMENT_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

TOPIC_MIN_SIZE = int(os.getenv("TOPIC_MIN_SIZE", 20000))
CALCULATE_TOPICS = os.getenv("CALCULATE_TOPICS", "") == "True"


def get_config_hash() -> str:
    """
    Generate a stable hash of the chunking configuration.

    If chunk_size or chunk_overlap changes, the hash changes and a full rebuild is triggered.
    """
    config = (
        f"chunk_size={DOCUMENT_SPLITTER._chunk_size}"
        f"_overlap={DOCUMENT_SPLITTER._chunk_overlap}"
        "_tokenizer=unicode_v1"
    )
    return hashlib.md5(config.encode()).hexdigest()[:8]


def iterate_qdrant_docs(
    vectorstore: Qdrant,
    batch_size=100,
    with_payload=True,
    with_vectors=False,
    scroll_filter=None,
):
    offset = None

    while True:
        points, offset = vectorstore.client.scroll(
            collection_name=QDRANT_COL,
            offset=offset,
            limit=batch_size,
            with_payload=with_payload,
            with_vectors=with_vectors,
            scroll_filter=scroll_filter,
        )

        for p in points:
            payload = p.payload or {}

            page_content = payload.get("page_content", "")
            metadata = payload.get("metadata", {})

            yield p.id, Document(page_content=page_content, metadata=metadata)

        if offset is None:
            break


def get_vectordb() -> Qdrant:
    client = QdrantClient(
        url=f"http://{QDRANT_HOST}:6333",
        grpc_port=6334,
        prefer_grpc=True,
    )

    vectorstore = Qdrant(client, QDRANT_COL, EMBEDDINGS)
    return vectorstore


def build_vectordb_from_sources(sources: List[DataSource]):
    vectordb = None
    for src in sources:
        vectordb = build_vectorstore(src.list_files(), src.name)

    extract_topics(vectordb)
    return vectordb


def build_vectorstore(files: List[VDBFile], source: str, batch_size=200):
    # Read status manifest file
    manifest = VDBManifest(QDRANT_PATH)
    current_config_hash = get_config_hash()

    config_changed = False
    if hasattr(manifest, "needs_config_rebuild"):
        try:
            config_changed = bool(manifest.needs_config_rebuild(current_config_hash))
        except Exception:
            config_changed = False

    # Limpiar manifest si config cambió
    if config_changed:
        logging.warning(
            "Chunking config changed; forcing full rebuild for all sources [config=%s]",
            current_config_hash,
        )
        manifest.manifest["processed_ids"] = {}
        manifest.manifest["total_chunks"] = 0
        manifest.manifest["completed"] = {}
        manifest.save()

    # Check if the part for this source is already constructed
    vectorstore = get_vectordb()

    if not vectorstore.client.collection_exists(QDRANT_COL):
        logging.info('Creating Qdrant collection...')

        # Create collection
        vectorstore.client.create_collection(
            collection_name=QDRANT_COL,
            vectors_config={
                "embedding": VectorParams(size=1536, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "bm25": SparseVectorParams(modifier=Modifier.IDF),
            },
        )

        logging.info('Creating Qdrant indexes...')

        # Create indexes
        vectorstore.client.create_payload_index(
            collection_name=QDRANT_COL,
            field_name="metadata.source",
            field_schema=PayloadSchemaType.KEYWORD,
        )

        vectorstore.client.create_payload_index(
            collection_name=QDRANT_COL,
            field_name="metadata.permissions.anyone",
            field_schema=PayloadSchemaType.BOOL,
        )

        vectorstore.client.create_payload_index(
            collection_name=QDRANT_COL,
            field_name="metadata.permissions.allowed",
            field_schema=PayloadSchemaType.KEYWORD,
        )

    # Update file permissions
    logging.info("Updating file permissions for source %s...", source)

    for file in files:
        update_file_permissions(
            vectorstore, file.metadata["id"], file.metadata["permissions"]
        )

    current = manifest.get_processed_ids(source)
    # Check files to update
    new = {f.metadata["id"]: f.metadata["modifiedTime"] for f in files}

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
        logging.info("VDB does not need any changes for source %s", source)

        return vectorstore

    # Delete chunks
    id_deletion_filter = Filter(
        must=[FieldCondition(key="metadata.id", match=MatchAny(any=files_to_delete))]
    )

    num_ids_to_delete = vectorstore.client.count(
        collection_name=vectorstore.collection_name, count_filter=id_deletion_filter
    ).count

    if num_ids_to_delete > 0:
        logging.info("Deleting VDB stale entries for source %s", source)
        manifest.remove_processed_ids(source, files_to_delete)
        manifest.remove_chunks(num_ids_to_delete)

        vectorstore.client.delete(
            collection_name=vectorstore.collection_name,
            points_selector=id_deletion_filter,
        )

        manifest.save()

    # Read file chunks in batches
    docs_batch, pending_ids = [], []

    def flush(reason="batch"):
        nonlocal docs_batch, pending_ids, manifest
        if not docs_batch:
            return

        for i in range(0, len(docs_batch), batch_size):
            sub_docs = docs_batch[i : i + batch_size]
            new_ids = [str(uuid.uuid4()) for _ in sub_docs]
            embs = EMBEDDINGS.embed_documents([i.page_content for i in sub_docs])

            points = [
                PointStruct(
                    id=uuid,
                    vector={
                        "embedding": emb,
                        "bm25": QDocument(text=doc.page_content, model=BM25_MODEL),
                    },
                    payload={
                        "page_content": doc.page_content,
                        "metadata": doc.metadata,
                    },
                )
                for uuid, emb, doc in zip(new_ids, embs, sub_docs)
            ]

            vectorstore.client.upsert(vectorstore.collection_name, points)

            if manifest.has_topics():
                assign_topics(vectorstore, new_ids)

        manifest.add_processed_ids(source, pending_ids)
        manifest.add_chunks(len(docs_batch))
        manifest.save()

        logging.info(
            "Persisted %s chunks from source %s [%s]",
            len(docs_batch),
            source,
            reason,
        )

        docs_batch, pending_ids = [], []

    for f in files:
        if f.metadata["id"] not in files_to_add:
            continue

        f.metadata["source"] = source

        txt = f.get_text()

        if not txt:
            # We add it to the manifest, since it has been already processed
            manifest.add_processed_ids(
                source, [(f.metadata["id"], f.metadata["modifiedTime"])]
            )
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

    # Update status manifest
    manifest.add_completed_source(source)
    if hasattr(manifest, "set_config_hash"):
        try:
            manifest.set_config_hash(current_config_hash)
        except Exception:
            pass
    manifest.save()
    logging.info(
        "Index saved in %s for source %s [config: %s]",
        QDRANT_PATH,
        source,
        current_config_hash,
    )
    return vectorstore


def update_file_permissions(vectorstore: Qdrant, file_id, new_permissions):
    # Create file filter
    id_filter = Filter(
        must=[FieldCondition(key="metadata.id", match=MatchValue(value=file_id))]
    )

    # Check if the permissions need to be updated
    _, first_doc = next(
        iterate_qdrant_docs(vectorstore, batch_size=1, scroll_filter=id_filter),
        (None, None),
    )

    if first_doc is None or first_doc.metadata.get("permissions") == new_permissions:
        return

    # Update the permissions in batch
    vectorstore.client.set_payload(
        collection_name=vectorstore.collection_name,
        key="metadata.permissions",
        payload=new_permissions,
        points=id_filter,
    )


def extract_topics(vectorstore: Qdrant, pool=None):
    manifest = VDBManifest(QDRANT_PATH)

    # Add topics if needed
    if not manifest.has_topics():
        if manifest.num_chunks() > TOPIC_MIN_SIZE:
            extract_initial_topics(vectorstore, QDRANT_PATH, pool)

            if CALCULATE_TOPICS:
                manifest.set_topics()
                manifest.save()

        else:
            logging.info('Not enough data in VDB for topic detection')
