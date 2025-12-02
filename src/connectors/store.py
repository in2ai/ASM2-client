import streamlit as st

from typing import List
import faiss

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.in_memory import InMemoryDocstore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from src.connectors.faiss_file import FaissFile
from src.connectors.manifest import FaissManifest

FAISS_PATH = "faiss_index"

INDEX = faiss.IndexFlatL2(1536)
EMBEDDINGS = OpenAIEmbeddings(model="text-embedding-3-small")
DOCUMENT_SPLITTER = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

def build_vectorstore(files: List[FaissFile], source, batch_size=200):
    global FAISS_PATH, DOCUMENT_SPLITTER, EMBEDDINGS, INDEX

    # Read status manifest file
    manifest = FaissManifest(FAISS_PATH)

    # Check if the part for this source is already constructed
    vectorstore = None

    try:
        vectorstore = FAISS.load_local(FAISS_PATH, EMBEDDINGS, allow_dangerous_deserialization=True)

        print(f"📂 ({source}) Cargando índice desde {FAISS_PATH}")
        
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
            pass
            # files_to_delete.add(id)
        
        elif id in new and new[id] != current[id]:
            files_to_add.add(id)
            files_to_delete.add(id)

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

        vectorstore.add_documents(docs_batch)
        vectorstore.save_local(FAISS_PATH)

        manifest.add_processed_ids(source, pending_ids)
        manifest.add_chunks(len(docs_batch))

        print(f"🧩 ({source}) Persistidos {len(docs_batch)} chunks [{reason}]")

        docs_batch, pending_ids = [], []

    for f in files:
        if f.metadata['id'] not in files_to_add:
            continue

        f.metadata['source'] = source

        if manifest.contains_file(f): 
            continue

        txt = f.get_text()
        
        if not txt: continue

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

    return vectorstore