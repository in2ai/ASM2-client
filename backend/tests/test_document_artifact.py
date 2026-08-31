import base64
import io
import re
import unittest

from PyPDF2 import PdfReader

from src.generation.artifact import (
    UnsupportedDocumentFormatError,
    build_document_artifact,
    slugify_filename_stem,
    to_stored_document,
)
from src.generation.model import Document, Paragraph, Section


# The download endpoint interpolates the filename straight into a
# Content-Disposition header, which is only safe while filenames stay in this shape.
SAFE_FILENAME = re.compile(r"^[a-z0-9-]{1,60}\.[a-z0-9]+$")


def build_document(title: str = "Quality report 2026") -> Document:
    return Document(
        title=title,
        sections=[
            Section(
                heading="Summary",
                content=[Paragraph(text="Everything is **fine**.")],
            )
        ],
    )


class SlugifyFilenameStemTests(unittest.TestCase):
    def test_transliterates_accents_and_collapses_separators(self):
        self.assertEqual(
            slugify_filename_stem("Informe de Calidad — Añó 2026"),
            "informe-de-calidad-ano-2026",
        )

    def test_falls_back_when_no_ascii_characters_survive(self):
        self.assertEqual(slugify_filename_stem("日本語"), "document")
        self.assertEqual(slugify_filename_stem("   "), "document")

    def test_truncates_long_titles_without_trailing_separator(self):
        stem = slugify_filename_stem("word " * 40)

        self.assertLessEqual(len(stem), 60)
        self.assertFalse(stem.endswith("-"))


class BuildDocumentArtifactTests(unittest.TestCase):
    def test_describes_the_rendered_document(self):
        artifact = build_document_artifact(build_document(), "markdown")

        self.assertEqual(artifact["filename"], "quality-report-2026.md")
        self.assertEqual(artifact["format"], "markdown")
        self.assertEqual(artifact["mime_type"], "text/markdown; charset=utf-8")
        self.assertEqual(artifact["title"], "Quality report 2026")
        self.assertEqual(
            artifact["size_bytes"], len(base64.b64decode(artifact["content"]))
        )

    def test_renders_every_supported_format(self):
        extensions = {"pdf": "pdf", "markdown": "md", "txt": "txt"}

        for format, extension in extensions.items():
            with self.subTest(format=format):
                artifact = build_document_artifact(build_document(), format)

                self.assertTrue(artifact["filename"].endswith(f".{extension}"))
                self.assertGreater(artifact["size_bytes"], 0)

    def test_filenames_are_always_header_safe(self):
        hostile_titles = [
            'Report"; rm -rf /',
            "Report\r\nX-Injected: yes",
            "Informe de Calidad — Añó 2026",
            "日本語",
            "../../etc/passwd",
            "word " * 40,
        ]

        for title in hostile_titles:
            with self.subTest(title=title):
                artifact = build_document_artifact(build_document(title), "pdf")

                self.assertRegex(artifact["filename"], SAFE_FILENAME)

    def test_rejects_unsupported_formats(self):
        document = build_document()

        with self.assertRaises(UnsupportedDocumentFormatError):
            build_document_artifact(document, "docx")


class PdfMetadataTests(unittest.TestCase):
    """Viewers label the tab from /Title, so it has to carry the real title."""

    def read_metadata(self, title: str) -> dict:
        artifact = build_document_artifact(build_document(title), "pdf")
        pdf_bytes = base64.b64decode(artifact["content"])

        return dict(PdfReader(io.BytesIO(pdf_bytes)).metadata)

    def test_titles_the_pdf_with_the_document_title(self):
        metadata = self.read_metadata("Explicación Detallada del Proyecto NUBA")

        self.assertEqual(metadata["/Title"], "Explicación Detallada del Proyecto NUBA")

    def test_leaves_no_reportlab_placeholders_behind(self):
        metadata = self.read_metadata("Quality report 2026")

        for field in ("/Title", "/Author", "/Subject", "/Creator"):
            with self.subTest(field=field):
                self.assertNotIn("anonymous", metadata[field])
                self.assertNotIn("unspecified", metadata[field])


class ToStoredDocumentTests(unittest.TestCase):
    def test_decodes_the_artifact_for_storage(self):
        artifact = build_document_artifact(build_document(), "txt")

        stored = to_stored_document(artifact)

        self.assertIsInstance(stored["content"], bytes)
        self.assertEqual(len(stored["content"]), artifact["size_bytes"])
        self.assertEqual(stored["size_bytes"], artifact["size_bytes"])
        self.assertEqual(stored["filename"], artifact["filename"])
        self.assertEqual(stored["mime_type"], artifact["mime_type"])
        self.assertEqual(stored["title"], "Quality report 2026")
        self.assertIn(b"QUALITY REPORT 2026", stored["content"])

    def test_sizes_the_document_from_the_decoded_bytes(self):
        artifact = build_document_artifact(build_document(), "txt")
        artifact["size_bytes"] = 999_999

        self.assertEqual(
            to_stored_document(artifact)["size_bytes"],
            len(base64.b64decode(artifact["content"])),
        )

    def test_falls_back_to_a_generic_media_type(self):
        stored = to_stored_document({"filename": "report.bin", "content": "YWJj"})

        self.assertEqual(stored["mime_type"], "application/octet-stream")
        self.assertEqual(stored["content"], b"abc")

    def test_rejects_artifacts_that_cannot_be_stored(self):
        unusable = [
            None,
            "not a dict",
            {"filename": "report.pdf"},
            {"filename": "report.pdf", "content": "not base64!!"},
            {"filename": "report.pdf", "content": None},
            {"content": "YWJj"},
            {"filename": "   ", "content": "YWJj"},
        ]

        for artifact in unusable:
            with self.subTest(artifact=artifact):
                self.assertIsNone(to_stored_document(artifact))


if __name__ == "__main__":
    unittest.main()
