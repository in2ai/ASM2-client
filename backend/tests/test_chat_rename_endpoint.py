import unittest

from fastapi.testclient import TestClient

import server
from src.chat.store import ChatNotFoundError, build_chat_title
from src.config.logto_auth import AuthInfo

CHAT_ROUTE = "/chats/{chat_id}"

CHAT = {
    "id": "chat-1",
    "title": "New conversation",
    "created_at": "2026-05-13T12:00:00Z",
    "updated_at": "2026-05-13T12:30:00Z",
    "last_message_preview": "Here is the report.",
    "messages": [],
}


class FakeChatStore:
    """Renames only user-1's chat-1, the way the real SQL scoping does."""

    def __init__(self):
        self.calls = []

    def rename_chat(self, user_id, chat_id, title):
        self.calls.append((user_id, chat_id, title))

        if (user_id, chat_id) != ("user-1", "chat-1"):
            raise ChatNotFoundError(chat_id=chat_id)

        return {**CHAT, "title": build_chat_title(title)}


def override_auth(auth: AuthInfo) -> None:
    """Point the route's auth dependency at a fixed identity."""

    for route in server.app.routes:
        if getattr(route, "path", "") == CHAT_ROUTE:
            dependency = route.dependant.dependencies[0].call
            server.app.dependency_overrides[dependency] = lambda: auth


class RenameChatTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()

    def test_renames_the_chat_and_returns_it(self):
        response = self.client.patch(
            "/chats/chat-1", json={"title": "  Holiday policy  "}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Holiday policy")
        self.assertEqual(self.store.calls, [("user-1", "chat-1", "  Holiday policy  ")])

    def test_falls_back_to_the_default_title_for_a_blank_name(self):
        response = self.client.patch("/chats/chat-1", json={"title": "   "})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "New conversation")

    def test_is_404_for_a_chat_owned_by_someone_else(self):
        response = self.client.patch("/chats/chat-9", json={"title": "Holiday policy"})

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Chat not found")

    def test_rejects_a_payload_without_a_title(self):
        response = self.client.patch("/chats/chat-1", json={})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.store.calls, [])


if __name__ == "__main__":
    unittest.main()
