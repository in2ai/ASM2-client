"""Test bootstrap: make the backend importable and stub heavy dependencies.

The unit tests only exercise pure logic, so modules that pull in large runtime
dependencies (torch, treedex, langchain, document parsers, ...) are replaced
with minimal stubs before the modules under test are imported.
"""

import sys
import types
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def _stub_module(name: str, **attrs):
    if name in sys.modules:
        return sys.modules[name]

    module = types.ModuleType(name)

    for attr, value in attrs.items():
        setattr(module, attr, value)

    sys.modules[name] = module
    return module


class _Document:
    """Minimal stand-in for langchain_core.documents.Document."""

    def __init__(self, page_content: str = "", metadata: dict | None = None):
        self.page_content = page_content
        self.metadata = metadata or {}


_stub_module("langchain_core")
_stub_module("langchain_core.documents", Document=_Document)
_stub_module("langchain_community")
_stub_module("langchain_community.vectorstores", Qdrant=object)
_stub_module(
    "src.connectors.store",
    BM25_MODEL="qdrant/bm25",
    iterate_qdrant_docs=lambda *args, **kwargs: iter(()),
)
_stub_module("src.connectors.source", DataSource=object)
