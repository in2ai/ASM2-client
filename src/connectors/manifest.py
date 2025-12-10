import os
import json
import datetime

from src.connectors.faiss_file import FaissFile


def load_manifest(path):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    return {
        "processed_ids": {}, 
        "total_chunks": 0, 
        "completed": {}, 
    }


class FaissManifest:
    def __init__(self, path):
        self.path = os.path.join(path, "progress.json")
        self.manifest = load_manifest(self.path)


    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.manifest, f, ensure_ascii=False, indent=2)


    def get_processed_ids(self, source):
        self.manifest['processed_ids'].setdefault(source, {})

        return self.manifest['processed_ids'][source]


    def remove_processed_ids(self, source, processed_ids):
        self.manifest['processed_ids'].setdefault(source, {})

        for id in processed_ids:
            self.manifest['processed_ids'][source].pop(id, '')


    def add_processed_ids(self, source, processed_ids):
        self.manifest['processed_ids'].setdefault(source, {})

        for id, time in processed_ids:
            self.manifest['processed_ids'][source][id] = time


    def add_chunks(self, chunks):
        self.manifest['total_chunks'] += chunks


    def remove_chunks(self, chunks):
        self.manifest['total_chunks'] -= chunks


    def add_completed_source(self, source):
        if source not in self.manifest['completed']:
            self.manifest['completed'][source] = datetime.datetime.now().isoformat()


    def is_source_completed(self, source):
        return source in self.manifest['completed']


    def contains_file(self, file: FaissFile) -> bool:
        source = file.metadata['source']
        self.manifest['processed_ids'].setdefault(source, {})

        return file.metadata['id'] in self.manifest['processed_ids'][source]