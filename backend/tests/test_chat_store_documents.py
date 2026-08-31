import unittest

from src.chat.store import (
    PostgresChatStore,
    document_descriptor_from_row,
    with_document_descriptor,
)


def build_row(**overrides) -> dict:
    row = {
        "id": "message-1",
        "chat_id": "chat-1",
        "role": "assistant",
        "content": "Here is the report.",
        "created_at": "2026-05-13T12:00:00Z",
        "status": "complete",
        "metadata": {"detected_lang": "es", "sources": []},
        "document_title": "Quality report 2026",
        "document_filename": "quality-report-2026.pdf",
        "document_format": "pdf",
        "document_mime_type": "application/pdf",
        "document_size_bytes": 2048,
    }
    row.update(overrides)
    return row


class DocumentDescriptorFromRowTests(unittest.TestCase):
    def test_builds_a_descriptor_from_the_joined_columns(self):
        self.assertEqual(
            document_descriptor_from_row(build_row()),
            {
                "title": "Quality report 2026",
                "filename": "quality-report-2026.pdf",
                "format": "pdf",
                "mime_type": "application/pdf",
                "size_bytes": 2048,
            },
        )

    def test_is_none_when_the_left_join_found_no_document(self):
        row = build_row(
            document_title=None,
            document_filename=None,
            document_format=None,
            document_mime_type=None,
            document_size_bytes=None,
        )

        self.assertIsNone(document_descriptor_from_row(row))

    def test_is_none_for_rows_without_the_joined_columns(self):
        self.assertIsNone(document_descriptor_from_row({"id": "message-1"}))


class WithDocumentDescriptorTests(unittest.TestCase):
    def test_advertises_the_document_in_the_metadata(self):
        metadata = with_document_descriptor(
            {"detected_lang": "es"}, {"filename": "report.pdf", "size_bytes": 10}
        )

        self.assertEqual(metadata["detected_lang"], "es")
        self.assertEqual(metadata["document"]["filename"], "report.pdf")

    def test_never_exposes_the_document_bytes(self):
        metadata = with_document_descriptor(
            None, {"filename": "report.pdf", "content": b"%PDF-1.7"}
        )

        self.assertNotIn("content", metadata["document"])

    def test_leaves_metadata_alone_without_a_document(self):
        metadata = {"detected_lang": "es"}

        self.assertIs(with_document_descriptor(metadata, None), metadata)
        self.assertIsNone(with_document_descriptor(None, None))


class RowToMessageTests(unittest.TestCase):
    def test_folds_the_document_into_the_message_metadata(self):
        message = PostgresChatStore._pg_row_to_message(build_row())

        self.assertEqual(message["id"], "message-1")
        self.assertEqual(message["metadata"]["detected_lang"], "es")
        self.assertEqual(
            message["metadata"]["document"]["filename"], "quality-report-2026.pdf"
        )
        self.assertNotIn("content", message["metadata"]["document"])

    def test_keeps_metadata_untouched_for_messages_without_a_document(self):
        row = build_row(document_filename=None, metadata={"detected_lang": "es"})

        message = PostgresChatStore._pg_row_to_message(row)

        self.assertEqual(message["metadata"], {"detected_lang": "es"})


if __name__ == "__main__":
    unittest.main()
