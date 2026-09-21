import unittest

from fastapi.testclient import TestClient

import server
from src.chat.store import ChatNotFoundError
from src.config.logto_auth import AuthInfo

CHAT_ROUTE = "/chats/{chat_id}"

CHAT = {
    "id": "chat-1",
    "title": "Holiday policy",
    "created_at": "2026-05-13T12:00:00Z",
    "updated_at": "2026-05-13T12:30:00Z",
    "pinned": False,
    "archived": False,
    "last_message_preview": "Here is the report.",
    "messages": [],
}


class FakeChatStore:
    """Holds the two flags for user-1's chat-1, the way the real SQL does."""

    def __init__(self):
        self.chat = dict(CHAT)
        self.listed = []

    def _owned(self, user_id, chat_id):
        if (user_id, chat_id) != ("user-1", "chat-1"):
            raise ChatNotFoundError(chat_id=chat_id)

    def list_chats(self, user_id, *, archived=False):
        self.listed.append((user_id, archived))
        return [self.chat] if self.chat["archived"] == archived else []

    def rename_chat(self, user_id, chat_id, title):
        self._owned(user_id, chat_id)
        self.chat["title"] = title
        return dict(self.chat)

    def set_chat_pinned(self, user_id, chat_id, pinned):
        self._owned(user_id, chat_id)
        self.chat["pinned"] = pinned
        return dict(self.chat)

    def set_chat_archived(self, user_id, chat_id, archived):
        self._owned(user_id, chat_id)
        self.chat["archived"] = archived
        if archived:
            self.chat["pinned"] = False
        return dict(self.chat)


def override_auth(auth: AuthInfo) -> None:
    """Point the chat routes' auth dependency at a fixed identity."""

    for route in server.app.routes:
        if getattr(route, "path", "") in {CHAT_ROUTE, "/chats"}:
            dependency = route.dependant.dependencies[0].call
            server.app.dependency_overrides[dependency] = lambda: auth


class PinChatTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()

    def test_pins_the_chat_and_returns_it(self):
        response = self.client.patch("/chats/chat-1", json={"pinned": True})

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["pinned"])

    def test_unpins_the_chat(self):
        self.store.chat["pinned"] = True

        response = self.client.patch("/chats/chat-1", json={"pinned": False})

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["pinned"])

    def test_leaves_the_title_alone_when_only_the_pin_changes(self):
        response = self.client.patch("/chats/chat-1", json={"pinned": True})

        self.assertEqual(response.json()["title"], "Holiday policy")

    def test_is_404_for_a_chat_owned_by_someone_else(self):
        response = self.client.patch("/chats/chat-9", json={"pinned": True})

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Chat not found")


class ArchiveChatTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()

    def test_archives_the_chat_and_returns_it(self):
        response = self.client.patch("/chats/chat-1", json={"archived": True})

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["archived"])

    def test_archiving_drops_the_pin(self):
        self.store.chat["pinned"] = True

        response = self.client.patch("/chats/chat-1", json={"archived": True})

        self.assertFalse(response.json()["pinned"])

    def test_unarchives_the_chat(self):
        self.store.chat["archived"] = True

        response = self.client.patch("/chats/chat-1", json={"archived": False})

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["archived"])

    def test_is_404_for_a_chat_owned_by_someone_else(self):
        response = self.client.patch("/chats/chat-9", json={"archived": True})

        self.assertEqual(response.status_code, 404)


class UpdateChatPayloadTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()

    def test_rejects_a_payload_that_asks_for_nothing(self):
        response = self.client.patch("/chats/chat-1", json={})

        self.assertEqual(response.status_code, 422)

    def test_renames_and_pins_in_one_request(self):
        response = self.client.patch(
            "/chats/chat-1", json={"title": "Expenses", "pinned": True}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "Expenses")
        self.assertTrue(response.json()["pinned"])


class ListChatsTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()

    def test_lists_the_active_chats_by_default(self):
        response = self.client.get("/chats")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.store.listed, [("user-1", False)])
        self.assertEqual(len(response.json()), 1)

    def test_lists_the_archived_chats_when_asked(self):
        self.store.chat["archived"] = True

        response = self.client.get("/chats?archived=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.store.listed, [("user-1", True)])
        self.assertEqual(len(response.json()), 1)


if __name__ == "__main__":
    unittest.main()
