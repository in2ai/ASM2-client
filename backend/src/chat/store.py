from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from psycopg2 import Binary
from psycopg2.extras import Json, RealDictCursor


DEFAULT_CHAT_TITLE = "New conversation"


@dataclass(frozen=True)
class ChatNotFoundError(Exception):
    chat_id: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def build_chat_title(content: str, fallback: str = DEFAULT_CHAT_TITLE) -> str:
    normalized = " ".join(content.split()).strip()
    if not normalized:
        return fallback
    if len(normalized) <= 60:
        return normalized
    return f"{normalized[:57].rstrip()}..."


def document_descriptor_from_row(row: dict[str, Any]) -> dict[str, Any] | None:
    """Descriptor built from the columns joined in from ``message_documents``."""

    if row.get("document_filename") is None:
        return None

    return {
        "title": row.get("document_title"),
        "filename": row["document_filename"],
        "format": row["document_format"],
        "mime_type": row["document_mime_type"],
        "size_bytes": row["document_size_bytes"],
    }


def with_document_descriptor(
    metadata: dict[str, Any] | None, document: dict[str, Any] | None
) -> dict[str, Any] | None:
    """Advertise a message's document in its metadata, without the bytes."""

    if document is None:
        return metadata

    descriptor = {
        key: value for key, value in document.items() if key != "content"
    }

    return {**(metadata or {}), "document": descriptor}


class PostgresChatStore:
    def __init__(self, pool):
        self._pool = pool

    @contextmanager
    def _cursor(self):
        conn = self._pool.getconn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._pool.putconn(conn)

    def list_chats(self, user_id: str) -> list[dict[str, Any]]:
        query = """
            SELECT
                chats.id,
                chats.title,
                chats.created_at,
                chats.updated_at,
                (
                    SELECT messages.content
                    FROM messages
                    WHERE messages.chat_id = chats.id
                    ORDER BY messages.created_at DESC
                    LIMIT 1
                ) AS last_message_preview
            FROM chats
            WHERE chats.user_id = %s
            ORDER BY chats.updated_at DESC, chats.created_at DESC
        """
        with self._cursor() as cur:
            cur.execute(query, (user_id,))
            rows = cur.fetchall()
        return [self._row_to_chat_summary(row) for row in rows]

    def create_chat(
        self,
        user_id: str,
        title: str | None = None,
        chat_id: str | None = None,
    ) -> dict[str, Any]:
        timestamp = utc_now()
        chat_identifier = chat_id or str(uuid4())
        resolved_title = build_chat_title(title or "", DEFAULT_CHAT_TITLE)

        with self._cursor() as cur:
            cur.execute(
                """
                INSERT INTO chats (id, user_id, title, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (chat_identifier, user_id, resolved_title, timestamp, timestamp),
            )

        return self.get_chat(user_id, chat_identifier) or {
            "id": chat_identifier,
            "title": resolved_title,
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_message_preview": None,
            "messages": [],
        }

    def ensure_chat(
        self,
        user_id: str,
        chat_id: str,
        title: str | None = None,
    ) -> dict[str, Any]:
        existing = self.get_chat(user_id, chat_id)
        if existing is not None:
            return existing
        return self.create_chat(user_id, title=title, chat_id=chat_id)

    def get_chat(self, user_id: str, chat_id: str) -> dict[str, Any] | None:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT
                    chats.id,
                    chats.title,
                    chats.created_at,
                    chats.updated_at,
                    (
                        SELECT messages.content
                        FROM messages
                        WHERE messages.chat_id = chats.id
                        ORDER BY messages.created_at DESC
                        LIMIT 1
                    ) AS last_message_preview
                FROM chats
                WHERE chats.id = %s AND chats.user_id = %s
                """,
                (chat_id, user_id),
            )
            chat_row = cur.fetchone()
            if chat_row is None:
                return None

            cur.execute(
                """
                SELECT
                    messages.id,
                    messages.chat_id,
                    messages.role,
                    messages.content,
                    messages.created_at,
                    messages.status,
                    messages.metadata,
                    message_documents.title AS document_title,
                    message_documents.filename AS document_filename,
                    message_documents.format AS document_format,
                    message_documents.mime_type AS document_mime_type,
                    message_documents.size_bytes AS document_size_bytes
                FROM messages
                LEFT JOIN message_documents
                    ON message_documents.message_id = messages.id
                WHERE messages.chat_id = %s
                ORDER BY messages.created_at ASC, messages.id ASC
                """,
                (chat_id,),
            )
            message_rows = cur.fetchall()

        chat = self._row_to_chat_summary(chat_row)
        chat["messages"] = [self._pg_row_to_message(row) for row in message_rows]
        return chat

    def get_message_document(
        self, user_id: str, chat_id: str, message_id: str
    ) -> dict[str, Any] | None:
        """The stored document for a message, bytes included, scoped to its owner."""

        with self._cursor() as cur:
            cur.execute(
                """
                SELECT
                    message_documents.filename,
                    message_documents.mime_type,
                    message_documents.content
                FROM message_documents
                JOIN messages ON messages.id = message_documents.message_id
                JOIN chats ON chats.id = messages.chat_id
                WHERE message_documents.message_id = %s
                  AND messages.chat_id = %s
                  AND chats.user_id = %s
                """,
                (message_id, chat_id, user_id),
            )
            row = cur.fetchone()

        if row is None:
            return None

        return {
            "filename": row["filename"],
            "mime_type": row["mime_type"],
            "content": bytes(row["content"]),
        }

    def delete_chat(self, user_id: str, chat_id: str) -> None:
        with self._cursor() as cur:
            cur.execute(
                "DELETE FROM chats WHERE id = %s AND user_id = %s",
                (chat_id, user_id),
            )
            if cur.rowcount == 0:
                raise ChatNotFoundError(chat_id=chat_id)

    def append_message(
        self,
        user_id: str,
        chat_id: str,
        role: str,
        content: str,
        *,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
        document: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        timestamp = utc_now()
        message_id = str(uuid4())

        with self._cursor() as cur:
            cur.execute(
                "SELECT id, title FROM chats WHERE id = %s AND user_id = %s",
                (chat_id, user_id),
            )
            chat_row = cur.fetchone()
            if chat_row is None:
                raise ChatNotFoundError(chat_id=chat_id)

            cur.execute(
                """
                INSERT INTO messages (id, chat_id, role, content, created_at, status, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    message_id,
                    chat_id,
                    role,
                    content,
                    timestamp,
                    status,
                    Json(metadata) if metadata is not None else None,
                ),
            )

            if document is not None:
                cur.execute(
                    """
                    INSERT INTO message_documents (
                        message_id, title, filename, format,
                        mime_type, size_bytes, content, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        message_id,
                        document.get("title"),
                        document["filename"],
                        document["format"],
                        document["mime_type"],
                        document["size_bytes"],
                        Binary(document["content"]),
                        timestamp,
                    ),
                )

            next_title = chat_row["title"]
            if role == "user" and next_title == DEFAULT_CHAT_TITLE:
                next_title = build_chat_title(content)

            cur.execute(
                "UPDATE chats SET title = %s, updated_at = %s WHERE id = %s",
                (next_title, timestamp, chat_id),
            )

        return {
            "id": message_id,
            "chat_id": chat_id,
            "role": role,
            "content": content,
            "created_at": timestamp,
            "status": status,
            "metadata": with_document_descriptor(metadata, document),
        }

    @staticmethod
    def _row_to_chat_summary(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_message_preview": row["last_message_preview"],
        }

    @staticmethod
    def _pg_row_to_message(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "chat_id": row["chat_id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"],
            "status": row["status"],
            "metadata": with_document_descriptor(
                row["metadata"], document_descriptor_from_row(row)
            ),
        }
