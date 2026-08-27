from concurrent.futures import ThreadPoolExecutor
import logging
import os
from typing import List
import uuid
import time
import threading
from datetime import timedelta

from treedex import TreeDex
from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, FieldCondition, Filter, MatchAny, MatchValue, Modifier, PayloadSchemaType, PointStruct, SparseVectorParams, VectorParams, BinaryQuantization, BinaryQuantizationConfig, MultiVectorComparator, MultiVectorConfig
from qdrant_client.http.models import Document as QDocument

from src.config.env import get_bool_env, get_env, get_int_env
from src.connectors.image_store import delete_images, write_image
from src.connectors.source import DataSource
from src.connectors.llms import get_configured_long_context_llm
from src.connectors.manifest import VDBManifest
from src.connectors.qdrant_ops import run_qdrant_write_with_retry
from src.connectors.vdb_file import VDBFile
from src.indexing.deletion_guard import enforce_sources_deletion_guard
from src.utils.topic import assign_topics, extract_initial_topics

QDRANT_HOST = get_env("QDRANT_HOST", "qdrant")
QDRANT_META_PATH = get_env("QDRANT_META_PATH", "/app/data/qdrant_meta")
QDRANT_TIMEOUT = 600
BM25_MODEL = "qdrant/bm25"
VDB_LOCK = 'vdb.lock'

TEXT_LOCK = threading.Lock()
DOWNLOAD_LOCK = threading.Lock()

QDRANT_COL = "documents"
QDRANT_IMG_COL = "images"

IMAGE_BATCH_SIZE = 4
IMAGE_ID_NAMESPACE = uuid.UUID("6f2a5c1e-8b3d-4e7a-9c04-1d5e8f2a7b60")

CHARS_PER_TOKEN = 3 # Approximate
CHUNK_SIZE = 512 * CHARS_PER_TOKEN
CHUNK_OVERLAP = 0.2
DOCUMENT_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE, 
    chunk_overlap=int(CHUNK_SIZE * CHUNK_OVERLAP),
    add_start_index=True,
    keep_separator=True
)

TOPIC_MIN_SIZE = get_int_env("TOPIC_MIN_SIZE", 20000)
CALCULATE_TOPICS = get_bool_env("CALCULATE_TOPICS")
VISUAL_RAG = get_bool_env("VISUAL_RAG")


def iterate_qdrant_docs(
    client,
    collection_name: str,
    batch_size=100,
    with_payload=True,
    with_vectors=False,
    scroll_filter=None,
):
    offset = None

    while True:
        points, offset = client.scroll(
            collection_name=collection_name,
            offset=offset,
            limit=batch_size,
            with_payload=with_payload,
            with_vectors=with_vectors,
            scroll_filter=scroll_filter,
            timeout=600
        )

        for p in points:
            payload = p.payload or {}

            page_content = payload.get("page_content", "")
            metadata = payload.get("metadata", {})

            yield p.id, Document(page_content=page_content, metadata=metadata)

        if offset is None:
            break


def get_vectordb(embeddings) -> Qdrant:
    client = QdrantClient(
        url=f"http://{QDRANT_HOST}:6333",
        grpc_port=6334,
        prefer_grpc=True,
        timeout=QDRANT_TIMEOUT,
    )

    vectorstore = Qdrant(client, QDRANT_COL, embeddings)
    return vectorstore


def create_image_collection(client, dims: int):
    """Create image collection if it doesn't exist."""

    if client.collection_exists(QDRANT_IMG_COL):
        info = client.get_collection(QDRANT_IMG_COL)
        qdrant_dim = info.config.params.vectors["embedding"].size

        if dims != qdrant_dim:
            logging.error(
                "Image embedding dimension mismatch: got %s, expected %s. "
                "The visual model may have changed.",
                dims,
                qdrant_dim,
            )

        return

    logging.info("Creating Qdrant image collection...")

    # Create collection
    client.create_collection(
        collection_name=QDRANT_IMG_COL,
        on_disk_payload=True,
        vectors_config={
            "embedding": VectorParams(
                size=dims,
                distance=Distance.COSINE,
                on_disk=True,
                multivector_config=MultiVectorConfig(
                    comparator=MultiVectorComparator.MAX_SIM
                ),
                quantization_config=BinaryQuantization(
                    binary=BinaryQuantizationConfig(always_ram=True),
                ),
            ),
        },
    )

    logging.info("Creating Qdrant image indexes...")

    # Create indexes
    for field, schema in (
        ("metadata.id", PayloadSchemaType.KEYWORD),
        ("metadata.source", PayloadSchemaType.KEYWORD),
        ("metadata.page", PayloadSchemaType.INTEGER),
        ("metadata.permissions.anyone", PayloadSchemaType.BOOL),
        ("metadata.permissions.allowed", PayloadSchemaType.KEYWORD),
    ):
        client.create_payload_index(
            collection_name=QDRANT_IMG_COL,
            field_name=field,
            field_schema=schema,
        )


def index_images(client, image_embedder, f: VDBFile) -> int:
    """File pages rendering, saving and embedding.

    Returns the number of indexed pages.
    """
    file_id = f.metadata["id"]
    batch: list[tuple[int, bytes]] = []
    total = 0

    def flush():
        nonlocal batch, total

        if not batch:
            return

        vectors = image_embedder.embed_images([data for _, data in batch])

        points = [
            PointStruct(
                id=str(uuid.uuid5(IMAGE_ID_NAMESPACE, f"{file_id}:{page}")),
                vector={"embedding": vector},
                payload={"metadata": {**f.metadata, "page": page}},
            )
            for (page, _), vector in zip(batch, vectors)
        ]

        run_qdrant_write_with_retry(
            lambda: client.upsert(QDRANT_IMG_COL, points),
            operation_name=f"upsert page images for file {file_id}",
        )

        total += len(points)
        batch = []

    for page, img in f.get_images():
        batch.append((page, write_image(file_id, page, img)))

        if len(batch) >= IMAGE_BATCH_SIZE:
            flush()

    flush()

    return total


def build_vectordb_from_sources(
    llm,
    embeddings,
    sources: List[DataSource],
    deletion_threshold_percentage: float | None,
    image_embedder=None,
):
    # Group sources by name
    grouped_sources = {}

    for source in sources:
        grouped_sources.setdefault(source.name, []).append(source)

    # Get unique files by grouped source
    grouped_files = {}

    for name, source_list in grouped_sources.items():
        files = grouped_files.setdefault(name, [])
        seen = set()

        for source in source_list:
            source_files = source.list_files()
            files.extend(f for f in source_files if f.metadata['id'] not in seen)
            seen.update(f.metadata['id'] for f in source_files)

    # Preflight the aggregate snapshot before any Qdrant or manifest mutation.
    # Counts remain namespaced per source, then are summed for the global ratio.
    if deletion_threshold_percentage is not None:
        manifest = VDBManifest(QDRANT_META_PATH)
        enforce_sources_deletion_guard(
            (
                (
                    name,
                    manifest.get_processed_ids(name).keys(),
                    (file.metadata["id"] for file in files),
                )
                for name, files in grouped_files.items()
            ),
            threshold_percentage=deletion_threshold_percentage,
        )

    # Build for each grouped source
    vectordb = None

    for name, files in grouped_files.items():
        vectordb = build_vectorstore(llm, embeddings, files, name, image_embedder=image_embedder)

    # Execute topic extraction
    extract_topics(llm, vectordb)

    return vectordb


def build_vectorstore(llm, embeddings, files: List[VDBFile], source: str, batch_size=200, image_embedder=None):
    # Read status manifest file
    manifest = VDBManifest(QDRANT_META_PATH)

    # Check if the part for this source is already constructed
    vectorstore = get_vectordb(embeddings)

    if not vectorstore.client.collection_exists(QDRANT_COL):
        logging.info('Creating Qdrant collection...')

        # Create collection
        vectorstore.client.create_collection(
            collection_name=QDRANT_COL,
            vectors_config={
                "embedding": VectorParams(size=vectorstore.embeddings.dims(), distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "bm25": SparseVectorParams(modifier=Modifier.IDF),
            },
        )

        logging.info('Creating Qdrant indexes...')

        # Create indexes
        vectorstore.client.create_payload_index(
            collection_name=QDRANT_COL,
            field_name="metadata.topic_rep",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        
        vectorstore.client.create_payload_index(
            collection_name=QDRANT_COL,
            field_name="metadata.id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        
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

    else:
        info = vectorstore.client.get_collection(QDRANT_COL)
        qdrant_dim = info.config.params.vectors["embedding"].size
        embedding_dim = vectorstore.embeddings.dims()

        if embedding_dim != qdrant_dim:
            logging.error(
                "Embedding dimension mismatch: got %s, expected %s. The embedding model may have changed.",
                embedding_dim,
                qdrant_dim,
            )

            return vectorstore

    if image_embedder is not None:
        create_image_collection(vectorstore.client, image_embedder.dims())

    # Update file permissions
    logging.info("Updating file permissions for source %s...", source)

    collections = [QDRANT_COL]

    if image_embedder is not None:
        collections.append(QDRANT_IMG_COL)

    for file in files:
        for collection in collections:
            update_file_permissions(
                vectorstore.client, collection, file.metadata["id"], file.metadata["permissions"],
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

    # Check images to update
    if image_embedder is not None:
        current_images = manifest.get_image_ids(source)
        images_to_delete = set()
        images_to_add = {id for id in new.keys() if id not in current_images}

        for id in current_images.keys():
            if id not in new:
                images_to_delete.add(id)
            elif new[id] != current_images[id]:
                images_to_add.add(id)
                images_to_delete.add(id)

    else:
        images_to_add, images_to_delete = set(), set()

    # Early return if no changes are needed
    if len(files_to_delete) == 0 and len(files_to_add) == 0 and len(images_to_delete) == 0 and len(images_to_add) == 0:
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

        run_qdrant_write_with_retry(
            lambda: vectorstore.client.delete(
                collection_name=vectorstore.collection_name,
                points_selector=id_deletion_filter,
            ),
            operation_name=f"delete stale entries for source {source}",
        )

        manifest.save()

        logging.info("Deleting long context stale entries for source %s", source)

        for f in files_to_delete:
            treedex_path = QDRANT_META_PATH + '/treedex'
            index_path = treedex_path + f'/{f}.json'

            if os.path.isfile(index_path):
                os.remove(index_path)

    # Delete page images
    if images_to_delete:
        logging.info("Deleting stale page images for source %s", source)

        image_deletion_filter = Filter(
            must=[FieldCondition(key="metadata.id", match=MatchAny(any=images_to_delete))]
        )

        run_qdrant_write_with_retry(
            lambda: vectorstore.client.delete(
                collection_name=QDRANT_IMG_COL,
                points_selector=image_deletion_filter,
            ),
            operation_name=f"delete stale page images for source {source}",
        )

        for file_id in images_to_delete:
            delete_images(file_id)

        manifest.remove_image_ids(source, images_to_delete)
        manifest.save()

    # Read file chunks in batches
    files_pending = len(files_to_add)
    files_processed = 0
    images_pending = len(images_to_add)
    images_processed = 0
    start_time = time.monotonic()
    docs_batch, pending_ids, chunk_idxs = [], [], []

    def flush(reason="batch"):
        nonlocal docs_batch, chunk_idxs, pending_ids, manifest, files_pending, files_processed, start_time

        if not docs_batch:
            return

        for i in range(0, len(docs_batch), batch_size):
            sub_docs = docs_batch[i : i + batch_size]
            idxs = chunk_idxs[i : i + batch_size]
            new_ids = [str(uuid.uuid4()) for _ in sub_docs]
            embs = vectorstore.embeddings.embed_documents([i.page_content for i in sub_docs])

            points = [
                PointStruct(
                    id=uuid,
                    vector={
                        "embedding": emb,
                        "bm25": QDocument(text=doc.page_content, model=BM25_MODEL),
                    },
                    payload={
                        "page_content": doc.page_content,
                        "metadata": {
                            **doc.metadata,
                            'chunk_idx': c_idx
                        },
                    },
                )
                for uuid, emb, doc, c_idx in zip(new_ids, embs, sub_docs, idxs)
            ]

            run_qdrant_write_with_retry(
                lambda: vectorstore.client.upsert(
                    vectorstore.collection_name, points
                ),
                operation_name=f"upsert chunks for source {source}",
            )

            if manifest.has_topics():
                assign_topics(vectorstore, new_ids)

        manifest.add_processed_ids(source, pending_ids)
        manifest.add_chunks(len(docs_batch))
        manifest.save()

        files_processed += len(pending_ids)

        elapsed = time.monotonic() - start_time

        progress = files_processed / files_pending if files_pending else 1.0

        if files_processed > 0:
            avg_time_per_file = elapsed / files_processed
            remaining = files_pending - files_processed
            eta_seconds = remaining * avg_time_per_file
        else:
            eta_seconds = 0

        eta = str(timedelta(seconds=int(eta_seconds)))

        logging.info(
            "Persisted %s chunks from source %s [%s] (%.1f%% - %d/%d files, ETA %s)",
            len(docs_batch),
            source,
            reason,
            progress * 100,
            files_processed,
            files_pending,
            eta,
        )

        docs_batch, pending_ids, chunk_idxs = [], [], []

    for f in files:
        file_id = f.metadata["id"]
        needs_text = file_id in files_to_add
        needs_images = file_id in images_to_add

        if not needs_text and not needs_images:
            continue

        f.metadata["source"] = source

        txt = None

        if needs_text:
            with TEXT_LOCK:
                txt = f.get_text()

        if needs_images:
            try:
                n_pages = index_images(vectorstore.client, image_embedder, f)
                manifest.add_image_ids(source, [(file_id, f.metadata["modifiedTime"])])
                manifest.save()

                images_processed += 1

                elapsed = time.monotonic() - start_time

                progress = images_processed / images_pending if images_pending else 1.0

                if images_processed > 0:
                    eta_seconds = (images_pending - images_processed) * (elapsed / images_processed)
                else:
                    eta_seconds = 0

                eta = str(timedelta(seconds=int(eta_seconds)))

                logging.info(
                    "Indexed %s page images for file %s (%.1f%% - %d/%d files, ETA %s)",
                    n_pages,
                    file_id,
                    progress * 100,
                    images_processed,
                    images_pending,
                    eta,
                )

            except Exception:
                logging.exception("Failed to index images for file %s", file_id)

        f.release()

        if not needs_text:
            continue

        if not txt:
            logging.warning(
                "No extractable text for file %s (source %s)%s",
                file_id,
                source,
                "" if needs_images else "; consider enabling VISUAL_RAG",
            )

            manifest.add_processed_ids(
                source, [(file_id, f.metadata["modifiedTime"])]
            )
            manifest.save()
            continue

        # Compute page offsets
        if isinstance(txt, list):
            joined_txt = '\n'.join(txt)
            pages = []
            start = 0

            for page in txt:
                end = start + len(page) + 1 # + 1 because of the \n
                pages.append([start, end])
                start = end

        else:
            joined_txt = txt
            pages = None

        base_doc = Document(page_content=joined_txt, metadata=f.metadata)
        chunks = DOCUMENT_SPLITTER.split_documents([base_doc])

        # Compute page metadata
        if pages is not None:
            for chunk in chunks:
                idx = chunk.metadata['start_index']
                page = next(i for i, p in enumerate(pages, 1) if idx >= p[0] and idx < p[1])
                chunk.metadata['page'] = page

        docs_batch.extend(chunks)
        chunk_idxs.extend(range(len(chunks)))
        pending_ids.append((file_id, f.metadata["modifiedTime"]))

        if len(docs_batch) >= batch_size:
            flush("batch")

    if docs_batch:
        flush("final")

    if get_bool_env('LONG_CONTEXT'):
        def generate_index(f):
            return generate_treedex_index(llm, f)
        
        # Generate long context
        with ThreadPoolExecutor() as executor:
            list(executor.map(generate_index, files))

    # Update status manifest
    manifest.add_completed_source(source)
    logging.info(
        "Index metadata saved in %s for source %s",
        QDRANT_META_PATH,
        source,
    )
    return vectorstore

def generate_treedex_index(llm, file: VDBFile):
    try:
        llm = get_configured_long_context_llm(llm)

        treedex_path = QDRANT_META_PATH + '/treedex'
        index_path = treedex_path + f'/{file.metadata["id"]}.json'

        if not os.path.isfile(index_path):
            temp_path = QDRANT_META_PATH + '/treedex/tmp'

            with DOWNLOAD_LOCK:
                file_path = file.download(temp_path)

            index = TreeDex.from_file(str(file_path), llm=llm, extract_images=get_bool_env('LONG_CONTEXT_IMGS'))
            index.save(index_path)

            os.remove(file_path)
            
        else:
            logging.info(f'Index for {file.metadata["id"]} already found')

    except Exception as e:
        logging.info(f"Error while generating TreeDex index: {e}")


def update_file_permissions(client, collection_name: str, file_id, new_permissions):
    # Create file filter
    id_filter = Filter(
        must=[FieldCondition(key="metadata.id", match=MatchValue(value=file_id))]
    )

    # Check if the permissions need to be updated
    _, first_doc = next(
        iterate_qdrant_docs(client, collection_name, batch_size=1, scroll_filter=id_filter),
        (None, None),
    )

    if first_doc is None or first_doc.metadata.get("permissions") == new_permissions:
        return

    # Update the permissions in batch
    run_qdrant_write_with_retry(
        lambda: client.set_payload(
            collection_name=collection_name,
            key="metadata.permissions",
            payload=new_permissions,
            points=id_filter,
        ),
        operation_name=f"update permissions for file {file_id}",
    )


def extract_topics(llm, vectorstore: Qdrant, pool=None):
    manifest = VDBManifest(QDRANT_META_PATH)

    # Add topics if needed
    if not manifest.has_topics():
        if manifest.num_chunks() > TOPIC_MIN_SIZE:
            extract_initial_topics(llm, vectorstore, QDRANT_META_PATH, pool)

            if CALCULATE_TOPICS:
                manifest.set_topics()
                manifest.save()

        else:
            logging.info('Not enough data in VDB for topic detection')
