import unittest

from qdrant_client import QdrantClient
from qdrant_client.http import models

from src.utils.topic import set_topic_payloads


class FakeQdrantClient:
    def __init__(self):
        self.calls = []

    def batch_update_points(self, **kwargs):
        self.calls.append(kwargs)
        return []


class FakeVectorStore:
    collection_name = "documents"

    def __init__(self):
        self.client = FakeQdrantClient()


class TopicPayloadTests(unittest.TestCase):
    def test_batches_topic_payload_updates_and_preserves_nested_metadata(self):
        vectorstore = FakeVectorStore()
        topic_payloads = {
            "point-1": {1: 0.8},
            "point-2": {"2": 0.7},
            "point-3": {3: 0.6},
        }

        set_topic_payloads(vectorstore, topic_payloads, batch_size=2)

        self.assertEqual(len(vectorstore.client.calls), 2)
        self.assertEqual(
            [
                len(call["update_operations"])
                for call in vectorstore.client.calls
            ],
            [2, 1],
        )

        first_call = vectorstore.client.calls[0]
        self.assertEqual(first_call["collection_name"], "documents")
        self.assertTrue(first_call["wait"])

        first_payload = first_call["update_operations"][0].set_payload
        self.assertEqual(first_payload.key, "metadata")
        self.assertEqual(first_payload.points, ["point-1"])
        self.assertEqual(first_payload.payload, {"topics": {"1": 0.8}})

    def test_skips_empty_topic_payload_collection(self):
        vectorstore = FakeVectorStore()

        set_topic_payloads(vectorstore, {}, batch_size=2)

        self.assertEqual(vectorstore.client.calls, [])

    def test_preserves_existing_nested_metadata_in_qdrant(self):
        client = QdrantClient(":memory:")
        client.create_collection(
            "documents",
            vectors_config=models.VectorParams(
                size=2,
                distance=models.Distance.COSINE,
            ),
        )
        client.upsert(
            "documents",
            [
                models.PointStruct(
                    id=1,
                    vector=[1.0, 0.0],
                    payload={
                        "metadata": {
                            "id": "file-1",
                            "permissions": {"anyone": False},
                        }
                    },
                )
            ],
        )
        vectorstore = FakeVectorStore()
        vectorstore.client = client

        set_topic_payloads(vectorstore, {1: {3: 0.75}}, batch_size=1)

        point = client.retrieve(
            "documents",
            [1],
            with_payload=True,
        )[0]
        self.assertEqual(
            point.payload,
            {
                "metadata": {
                    "id": "file-1",
                    "permissions": {"anyone": False},
                    "topics": {"3": 0.75},
                }
            },
        )


if __name__ == "__main__":
    unittest.main()
