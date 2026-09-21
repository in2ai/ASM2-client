"""Progress reports sent to the user while a chat turn runs.

A turn can take a while -- several searches, a relevance pass over every
chunk, sometimes a whole document written from scratch -- and the answer
itself only arrives at the end. These events tell the user what the backend
is doing meanwhile.

They carry a phase name and plain data, never prose: the frontend owns the
wording so it can show it in the user's own language.
"""

import logging
from typing import Any

from langgraph.config import get_stream_writer


# Phases the frontend knows how to render; anything else it ignores.
UNDERSTANDING = "understanding"
THINKING = "thinking"
SEARCHING = "searching"
READING = "reading"
EXPANDING = "expanding"
REFINING = "refining"
WRITING_DOCUMENT = "writing_document"
COMPOSING = "composing"
SUMMARIZING = "summarizing"


def emit(phase: str, **data: Any) -> None:
    """Report a step of the current turn to whoever is following it.

    Does nothing when nobody is listening -- the graph also runs outside a
    streaming request (benchmarks, `ainvoke`), and a progress report is never
    worth failing a turn over.
    """

    try:
        get_stream_writer()({"phase": phase, **data})

    except Exception:
        logging.debug("Could not emit progress for phase %s", phase, exc_info=True)
