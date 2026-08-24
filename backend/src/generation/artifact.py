"""Packaging of generated documents so they can travel from the tool call to the client.

A rendered document leaves the tool base64-encoded, because the artifact is
serialized into the graph checkpoint alongside the rest of the conversation.
Persistence decodes it again: the bytes live in the ``message_documents`` table,
never in the message metadata, so listing a chat never reads them.
"""

import base64
import re
import unicodedata
from typing import Any

from src.generation.model import Document
from src.generation.rendering import (
    DocumentRenderer,
    MarkdownRenderer,
    PdfRenderer,
    TxtRenderer,
)


DOCUMENT_FORMATS: dict[str, dict[str, Any]] = {
    "pdf": {
        "extension": "pdf",
        "mime_type": "application/pdf",
        "renderer": PdfRenderer,
    },
    "markdown": {
        "extension": "md",
        "mime_type": "text/markdown; charset=utf-8",
        "renderer": MarkdownRenderer,
    },
    "txt": {
        "extension": "txt",
        "mime_type": "text/plain; charset=utf-8",
        "renderer": TxtRenderer,
    },
}

DEFAULT_DOCUMENT_STEM = "document"
MAX_FILENAME_STEM_LENGTH = 60


def get_renderer(format: str) -> DocumentRenderer:
    spec = DOCUMENT_FORMATS.get(format)

    if spec is None:
        raise ValueError(f"Unsupported document format: {format}")

    return spec["renderer"]()


def slugify_filename_stem(title: str) -> str:
    """Reduce a title to ``[a-z0-9-]``, which keeps generated filenames header-safe."""

    ascii_title = (
        unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    )
    slug = re.sub(r"[^A-Za-z0-9]+", "-", ascii_title).strip("-").lower()

    if not slug:
        return DEFAULT_DOCUMENT_STEM

    return slug[:MAX_FILENAME_STEM_LENGTH].strip("-") or DEFAULT_DOCUMENT_STEM


def build_document_artifact(document: Document, format: str) -> dict[str, Any]:
    """Render ``document`` and wrap it for transport through the graph state."""

    spec = DOCUMENT_FORMATS.get(format)

    if spec is None:
        raise ValueError(f"Unsupported document format: {format}")

    doc_bytes = get_renderer(format).render(document)

    return {
        "title": document.title,
        "filename": f'{slugify_filename_stem(document.title)}.{spec["extension"]}',
        "format": format,
        "mime_type": spec["mime_type"],
        "size_bytes": len(doc_bytes),
        "content": base64.b64encode(doc_bytes).decode("ascii"),
    }


def to_stored_document(artifact: Any) -> dict[str, Any] | None:
    """The artifact as it is persisted: descriptor fields plus the decoded bytes."""

    if not isinstance(artifact, dict):
        return None

    content = artifact.get("content")
    filename = artifact.get("filename")

    if not isinstance(content, str) or not isinstance(filename, str):
        return None

    if not filename.strip():
        return None

    try:
        doc_bytes = base64.b64decode(content, validate=True)
    except ValueError:
        return None

    return {
        "title": artifact.get("title"),
        "filename": filename,
        "format": artifact.get("format") or "",
        "mime_type": artifact.get("mime_type") or "application/octet-stream",
        "size_bytes": len(doc_bytes),
        "content": doc_bytes,
    }
