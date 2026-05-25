import json
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from typing import Any
from uuid import uuid4

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


class ChatStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._lock = RLock()
        directory = os.path.dirname(db_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _init_db(self) -> None:
        with self._lock, self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS chats (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    chat_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    status TEXT,
                    metadata TEXT,
                    FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chats_user_updated
                    ON chats(user_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_messages_chat_created
                    ON messages(chat_id, created_at ASC);
                """
            )

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
            WHERE chats.user_id = ?
            ORDER BY chats.updated_at DESC, chats.created_at DESC
        """
        with self._lock, self._connect() as connection:
            rows = connection.execute(query, (user_id,)).fetchall()
        return [self._row_to_chat_summary(row) for row in rows]

    def create_chat(
        self,
        user_id: str,
        title: str | None = None,
        chat_id: str | None = None,
    ) -> dict[str, Any]:
        timestamp = utc_now_iso()
        chat_identifier = chat_id or str(uuid4())
        resolved_title = build_chat_title(title or "", DEFAULT_CHAT_TITLE)

        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO chats (id, user_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (chat_identifier, user_id, resolved_title, timestamp, timestamp),
            )
            connection.commit()

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
        with self._lock, self._connect() as connection:
            chat_row = connection.execute(
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
                WHERE chats.id = ? AND chats.user_id = ?
                """,
                (chat_id, user_id),
            ).fetchone()
            if chat_row is None:
                return None

            message_rows = connection.execute(
                """
                SELECT id, chat_id, role, content, created_at, status, metadata
                FROM messages
                WHERE chat_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (chat_id,),
            ).fetchall()

        chat = self._row_to_chat_summary(chat_row)
        chat["messages"] = [self._row_to_message(row) for row in message_rows]
        return chat

    def delete_chat(self, user_id: str, chat_id: str) -> None:
        with self._lock, self._connect() as connection:
            result = connection.execute(
                "DELETE FROM chats WHERE id = ? AND user_id = ?",
                (chat_id, user_id),
            )
            if result.rowcount == 0:
                raise ChatNotFoundError(chat_id=chat_id)
            connection.commit()

    def append_message(
        self,
        user_id: str,
        chat_id: str,
        role: str,
        content: str,
        *,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        timestamp = utc_now_iso()
        message_id = str(uuid4())
        serialized_metadata = json.dumps(metadata) if metadata is not None else None

        with self._lock, self._connect() as connection:
            chat_row = connection.execute(
                "SELECT id, title FROM chats WHERE id = ? AND user_id = ?",
                (chat_id, user_id),
            ).fetchone()
            if chat_row is None:
                raise ChatNotFoundError(chat_id=chat_id)

            connection.execute(
                """
                INSERT INTO messages (id, chat_id, role, content, created_at, status, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (message_id, chat_id, role, content, timestamp, status, serialized_metadata),
            )

            next_title = chat_row["title"]
            if role == "user" and next_title == DEFAULT_CHAT_TITLE:
                next_title = build_chat_title(content)

            connection.execute(
                "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
                (next_title, timestamp, chat_id),
            )
            connection.commit()

        return {
            "id": message_id,
            "chat_id": chat_id,
            "role": role,
            "content": content,
            "created_at": timestamp,
            "status": status,
            "metadata": metadata,
        }

    @staticmethod
    def _row_to_chat_summary(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_message_preview": row["last_message_preview"],
        }

    @staticmethod
    def _row_to_message(row: sqlite3.Row) -> dict[str, Any]:
        metadata = row["metadata"]
        return {
            "id": row["id"],
            "chat_id": row["chat_id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"],
            "status": row["status"],
            "metadata": json.loads(metadata) if metadata else None,
        }


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
                SELECT id, chat_id, role, content, created_at, status, metadata
                FROM messages
                WHERE chat_id = %s
                ORDER BY created_at ASC, id ASC
                """,
                (chat_id,),
            )
            message_rows = cur.fetchall()

        chat = self._row_to_chat_summary(chat_row)
        chat["messages"] = [self._pg_row_to_message(row) for row in message_rows]
        return chat

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
            "metadata": metadata,
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
            "metadata": row["metadata"],
        }
