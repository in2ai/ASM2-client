import os
import json
import datetime

from src.connectors.vdb_file import VDBFile


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
        "topics": False,
        "initialized": False,
    }


class VDBManifest:
    def __init__(self, path):
        self.path = os.path.join(path, "progress.json")
        self.manifest = load_manifest(self.path)


    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
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


    def num_chunks(self):
        return self.manifest['total_chunks']


    def add_chunks(self, chunks):
        self.manifest['total_chunks'] += chunks


    def remove_chunks(self, chunks):
        self.manifest['total_chunks'] -= chunks


    def add_completed_source(self, source):
        if source not in self.manifest['completed']:
            self.manifest['completed'][source] = datetime.datetime.now().isoformat()


    def is_source_completed(self, source):
        return source in self.manifest['completed']


    def contains_file(self, file: VDBFile) -> bool:
        source = file.metadata['source']
        self.manifest['processed_ids'].setdefault(source, {})

        return file.metadata['id'] in self.manifest['processed_ids'][source]


    def has_topics(self):
        return self.manifest['topics']
    

    def set_topics(self):
        self.manifest['topics'] = True


    def is_initialized(self):
        return self.manifest.get('initialized', False)


    def set_initialized(self):
        self.manifest['initialized'] = True
