import streamlit as st

from typing import List, Tuple, Optional
import faiss
import os
import json
import pickle

import bm25s
import Stemmer

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain.retrievers.ensemble import EnsembleRetriever
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_openai import OpenAIEmbeddings
from pydantic import Field

from src.connectors.faiss_file import FaissFile
from src.connectors.manifest import FaissManifest

FAISS_PATH = "faiss_index"
BM25_PATH = "bm25_index"

INDEX = faiss.IndexFlatIP(1536)
EMBEDDINGS = OpenAIEmbeddings(model="text-embedding-3-small")
DOCUMENT_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
STEMMER = Stemmer.Stemmer("spanish")

# Pesos para búsqueda híbrida (0.0 = solo vector, 1.0 = solo BM25)
BM25_WEIGHT = 0.3
VECTOR_WEIGHT = 0.7


class BM25Retriever(BaseRetriever):
    """Retriever BM25"""
    
    index: Optional[bm25s.BM25] = None
    documents: List[Document] = Field(default_factory=list)
    k: int = 256
    
    class Config:
        arbitrary_types_allowed = True
    
    @classmethod
    def load_local(cls, path: str, k: int = 256) -> "BM25Retriever":
        """Carga índice BM25 desde disco."""
        instance = cls(k=k)
        instance.index = bm25s.BM25.load(path, load_corpus=False)
        
        with open(os.path.join(path, "documents.pkl"), "rb") as f:
            instance.documents = pickle.load(f)
        
        return instance
    
    def save_local(self, path: str) -> None:
        """Guarda índice BM25 en disco."""
        os.makedirs(path, exist_ok=True)
        self.index.save(path, corpus=None)
        
        with open(os.path.join(path, "documents.pkl"), "wb") as f:
            pickle.dump(self.documents, f)
        
        with open(os.path.join(path, "metadata.json"), "w") as f:
            json.dump({"num_documents": len(self.documents)}, f)
    
    def add_documents(self, documents: List[Document]) -> None:
        """Construye índice BM25 a partir de documentos."""
        if not documents:
            return
        
        self.documents = documents
        corpus = [doc.page_content for doc in documents]
        corpus_tokens = bm25s.tokenize(corpus, stemmer=STEMMER)
        
        self.index = bm25s.BM25()
        self.index.index(corpus_tokens)
    
    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> List[Document]:
        """Recupera documentos relevantes."""
        if self.index is None or not self.documents:
            return []
        
        query_tokens = bm25s.tokenize([query], stemmer=STEMMER)
        results, _ = self.index.retrieve(query_tokens, k=min(self.k, len(self.documents)))
        
        return [self.documents[idx] for idx in results[0] if 0 <= idx < len(self.documents)]
    
    @staticmethod
    def index_exists(path: str) -> bool:
        """Verifica si existe un índice válido."""
        return all(os.path.exists(os.path.join(path, f)) for f in ["index.pkl", "documents.pkl", "metadata.json"])
    
    @staticmethod
    def needs_rebuild(path: str, doc_count: int) -> bool:
        """Verifica si el índice necesita reconstruirse."""
        metadata_file = os.path.join(path, "metadata.json")
        if not os.path.exists(metadata_file):
            return True
        
        try:
            with open(metadata_file, "r") as f:
                return json.load(f).get("num_documents", 0) != doc_count
        except Exception:
            return True

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
    
    # Cargar o construir índice BM25
    if BM25Retriever.index_exists(BM25_PATH) and not BM25Retriever.needs_rebuild(BM25_PATH, len(all_docs)):
        print(f"📂 BM25: Cargando índice desde {BM25_PATH}")
        bm25_retriever = BM25Retriever.load_local(BM25_PATH, k=k)
    else:
        print("🔨 BM25: Construyendo índice...")
        bm25_retriever = BM25Retriever(k=k)
        bm25_retriever.add_documents(all_docs)
        bm25_retriever.save_local(BM25_PATH)
        print(f"💾 BM25: Índice guardado en {BM25_PATH}")
    
    # Crear retriever FAISS
    faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    
    # Combinar con EnsembleRetriever
    hybrid_retriever = EnsembleRetriever(
        retrievers=[bm25_retriever, faiss_retriever],
        weights=[BM25_WEIGHT, VECTOR_WEIGHT]
    )
    
    print(f"🔀 Retriever híbrido creado: {len(all_docs)} documentos, BM25={BM25_WEIGHT}, Vector={VECTOR_WEIGHT}")
    
    return hybrid_retriever, all_docs