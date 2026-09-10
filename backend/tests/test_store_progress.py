from dataclasses import asdict
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.connectors import store
from src.indexing.progress import IndexingProgress, PHASE_INDEXING


class RecordingProgress(IndexingProgress):
    def __init__(self):
        super().__init__()
        self.snapshots = []

    def publish(self, **kwargs):
        self.snapshots.append(asdict(self.state))


@pytest.fixture
def vectorstore(monkeypatch, tmp_path):
    vectorstore = MagicMock()
    vectorstore.collection_name = "documents"
    vectorstore.client.collection_exists.return_value = True
    vectorstore.client.get_collection.return_value = SimpleNamespace(
        config=SimpleNamespace(
            params=SimpleNamespace(vectors={"embedding": SimpleNamespace(size=3)})
        )
    )
    vectorstore.embeddings.dims.return_value = 3
    vectorstore.embeddings.embed_documents.side_effect = lambda texts: [
        [1.0, 0.0, 0.0] for _ in texts
    ]
    vectorstore.client.count.return_value = SimpleNamespace(count=0)
    vectorstore.client.scroll.return_value = ([], None)
    monkeypatch.setattr(store, "QDRANT_META_PATH", str(tmp_path))
    monkeypatch.setattr(store, "get_vectordb", lambda embeddings: vectorstore)
    monkeypatch.setattr(store, "get_bool_env", lambda key: False)
    return vectorstore


def make_file(file_id, text):
    return SimpleNamespace(
        metadata={
            "id": file_id,
            "modifiedTime": "2026-09-07",
            "permissions": {"anyone": False, "allowed": []},
        },
        get_text=lambda: text,
    )


def test_dimension_mismatch_does_not_complete_the_source(vectorstore):
    vectorstore.embeddings.dims.return_value = 4
    source = SimpleNamespace(
        name="drive", list_files=lambda: [make_file("new", "Document text")]
    )
    progress = RecordingProgress()
    progress.start([source.name])

    with pytest.raises(ValueError, match="Embedding dimension mismatch: got 4, expected 3"):
        store.build_vectordb_from_sources(
            None, vectorstore.embeddings, [source], None, progress=progress
        )

    assert progress.state.sources_completed == 0
    vectorstore.client.upsert.assert_not_called()
    vectorstore.client.set_payload.assert_not_called()


@pytest.mark.parametrize(
    ("texts", "expected_counts", "expected_chunks"),
    [
        (["", "", ""], [0, 1, 2, 3], 0),
        (["Document text", "", ""], [0, 1, 2, 3], 1),
        (["", "Document text", ""], [0, 1, 2, 3], 1),
    ],
)
def test_empty_files_publish_progress_without_a_later_batch(
    vectorstore, texts, expected_counts, expected_chunks
):
    files = [make_file(str(i), text) for i, text in enumerate(texts)]
    progress = RecordingProgress()
    progress.start(["drive"])

    store.build_vectorstore(
        None, vectorstore.embeddings, files, "drive", batch_size=1, progress=progress
    )

    snapshots = [s for s in progress.snapshots if s["phase"] == PHASE_INDEXING]
    assert [s["files_processed"] for s in snapshots] == expected_counts
    assert snapshots[-1]["files_total"] == len(files)
    assert snapshots[-1]["chunks_indexed"] == expected_chunks
    assert snapshots[-1]["eta_seconds"] == 0
    manifest = store.VDBManifest(store.QDRANT_META_PATH)
    assert len(manifest.get_processed_ids("drive")) == len(files)
    assert manifest.num_chunks() == expected_chunks


def test_empty_file_does_not_count_pending_text_as_persisted(vectorstore):
    progress = RecordingProgress()
    progress.start(["drive"])

    store.build_vectorstore(
        None,
        vectorstore.embeddings,
        [make_file("text", "Document text"), make_file("empty", "")],
        "drive",
        progress=progress,
    )

    snapshots = [s for s in progress.snapshots if s["phase"] == PHASE_INDEXING]
    assert [(s["files_processed"], s["chunks_indexed"]) for s in snapshots] == [
        (0, 0), (1, 0), (2, 1)
    ]
