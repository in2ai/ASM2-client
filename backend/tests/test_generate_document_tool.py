import unittest
from unittest.mock import patch

from graph.tools import generate_document
from src.generation.artifact import UnsupportedDocumentFormatError
from src.generation.model import Document


class GenerateDocumentToolTests(unittest.TestCase):
    def test_does_not_report_rendering_errors_as_unsupported_formats(self):
        document = Document(title="Report", sections=[])
        config = {"configurable": {"llm": object()}}

        with (
            patch(
                "graph.tools.generate_document_from_context",
                return_value=document,
            ),
            patch(
                "graph.tools.build_document_artifact",
                side_effect=ValueError("rendering failed"),
            ),
            self.assertRaisesRegex(ValueError, "rendering failed"),
        ):
            generate_document.func(
                query="Create a report",
                format="pdf",
                config=config,
                messages=[],
            )

    def test_reports_unsupported_formats_without_raising(self):
        document = Document(title="Report", sections=[])
        config = {"configurable": {"llm": object()}}

        with (
            patch(
                "graph.tools.generate_document_from_context",
                return_value=document,
            ),
            patch(
                "graph.tools.build_document_artifact",
                side_effect=UnsupportedDocumentFormatError("unsupported"),
            ),
        ):
            message, artifact = generate_document.func(
                query="Create a report",
                format="docx",
                config=config,
                messages=[],
            )

        self.assertIn("not supported", message)
        self.assertIsNone(artifact)


if __name__ == "__main__":
    unittest.main()
