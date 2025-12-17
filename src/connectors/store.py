import streamlit as st

from typing import List, Tuple
import faiss

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers.ensemble import EnsembleRetriever
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from src.connectors.faiss_file import FaissFile
from src.connectors.manifest import FaissManifest

FAISS_PATH = "faiss_index"

INDEX = faiss.IndexFlatIP(1536)
EMBEDDINGS = OpenAIEmbeddings(model="text-embedding-3-small")
DOCUMENT_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

# Pesos para búsqueda híbrida (0.0 = solo vector, 1.0 = solo BM25)
BM25_WEIGHT = 0.4
VECTOR_WEIGHT = 0.6

def setup_faiss_gpu(vectorstore):
    try:
        gpu_res = faiss.StandardGpuResources()
        vectorstore.index = faiss.index_cpu_to_gpu(gpu_res, 0, vectorstore.index)
        print('Set up FAISS GPU')

    except Exception as e:
        print('Unable to set up FAISS GPU')

def build_vectorstore(files: List[FaissFile], source, batch_size=200):
    global FAISS_PATH, DOCUMENT_SPLITTER, EMBEDDINGS, INDEX

    # Read status manifest file
    manifest = FaissManifest(FAISS_PATH)

    # Check if the part for this source is already constructed
    vectorstore = None

    try:
        print(f"📂 ({source}) Cargando índice desde {FAISS_PATH}")
        vectorstore = FAISS.load_local(FAISS_PATH, EMBEDDINGS, allow_dangerous_deserialization=True)
        
    except Exception:
        pass

    # Construct a new DB if needed
    if vectorstore is None:
        vectorstore = FAISS(embedding_function=EMBEDDINGS, index=INDEX, docstore=InMemoryDocstore({}), index_to_docstore_id={})

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
        setup_faiss_gpu(vectorstore)

        return vectorstore

    # Delete chunks
    ids_to_delete = [
        doc_id for doc_id, doc in vectorstore.docstore._dict.items()
        if doc.metadata['id'] in files_to_delete
    ]

    if len(ids_to_delete) > 0:
        manifest.remove_processed_ids(source, files_to_delete)
        manifest.remove_chunks(len(ids_to_delete))
        
        vectorstore.delete(ids_to_delete)
        vectorstore.save_local(FAISS_PATH)

    # Read file chunks in batches
    docs_batch, pending_ids = [], []

    def flush(reason="batch"):
        nonlocal docs_batch, pending_ids, manifest
        if not docs_batch: return

        for i in range(0, len(docs_batch), batch_size):
            sub_docs = docs_batch[i:i + batch_size]
            vectorstore.add_documents(sub_docs)
            vectorstore.save_local(FAISS_PATH)

        manifest.add_processed_ids(source, pending_ids)
        manifest.add_chunks(len(docs_batch))

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
    manifest.save()

    print(f"💾 ({source}) Índice guardado en {FAISS_PATH}")
    
    setup_faiss_gpu(vectorstore)

    return vectorstore


def get_all_documents(vectorstore: FAISS) -> List[Document]:
    """Extrae todos los documentos de un vectorstore FAISS para indexación BM25."""
    if vectorstore is None:
        return []
    
    return list(vectorstore.docstore._dict.values())


def create_hybrid_retriever(vectorstore: FAISS, k: int = 256) -> Tuple[EnsembleRetriever, List[Document]]:
    """
    Crea un retriever híbrido combinando BM25 (léxico) y FAISS (semántico).
    
    Args:
        vectorstore: El vectorstore FAISS
        k: Número de documentos a recuperar de cada retriever
        
    Returns:
        Tupla de (EnsembleRetriever, List[Document]) - el retriever y todos los documentos
    """
    # Obtener todos los documentos para BM25
    all_docs = get_all_documents(vectorstore)
    
    if not all_docs:
        return None, []
    
    # Crear retriever BM25
    bm25_retriever = BM25Retriever.from_documents(all_docs)
    bm25_retriever.k = k
    
    # Crear retriever FAISS
    faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    
    # Combinar con EnsembleRetriever (Reciprocal Rank Fusion)
    hybrid_retriever = EnsembleRetriever(
        retrievers=[bm25_retriever, faiss_retriever],
        weights=[BM25_WEIGHT, VECTOR_WEIGHT]
    )
    
    print(f"🔀 Retriever híbrido creado: {len(all_docs)} documentos, BM25={BM25_WEIGHT}, Vector={VECTOR_WEIGHT}")
    
    return hybrid_retriever, all_docs