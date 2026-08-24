import unittest

from fastapi.testclient import TestClient

import server
from src.config.logto_auth import AuthInfo

DOCUMENT_ROUTE = "/chats/{chat_id}/messages/{message_id}/document"

DOCUMENT = {
    "filename": "quality-report-2026.pdf",
    "mime_type": "application/pdf",
    "content": b"%PDF-1.7 fake document",
}


class FakeChatStore:
    """Answers only for user-1's chat-1/message-1, the way the real SQL scoping does."""

    def __init__(self):
        self.calls = []

    def get_message_document(self, user_id, chat_id, message_id):
        self.calls.append((user_id, chat_id, message_id))

        if (user_id, chat_id, message_id) == ("user-1", "chat-1", "message-1"):
            return dict(DOCUMENT)

        return None


def override_auth(auth: AuthInfo) -> None:
    """Point the route's auth dependency at a fixed identity."""

    for route in server.app.routes:
        if getattr(route, "path", "") == DOCUMENT_ROUTE:
            dependency = route.dependant.dependencies[0].call
            server.app.dependency_overrides[dependency] = lambda: auth


class DownloadChatDocumentTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

    def tearDown(self):
        server.app.dependency_overrides.clear()

    def test_serves_the_document_as_an_attachment(self):
        response = self.client.get("/chats/chat-1/messages/message-1/document")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, DOCUMENT["content"])
        self.assertEqual(response.headers["content-type"], "application/pdf")
        self.assertEqual(
            response.headers["content-disposition"],
            'attachment; filename="quality-report-2026.pdf"',
        )
        self.assertEqual(response.headers["cache-control"], "private, max-age=86400")

    def test_scopes_the_lookup_to_the_authenticated_user(self):
        self.client.get("/chats/chat-1/messages/message-1/document")

        self.assertEqual(self.store.calls, [("user-1", "chat-1", "message-1")])

    def test_returns_404_when_the_message_has_no_document(self):
        response = self.client.get("/chats/chat-1/messages/message-2/document")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json()["detail"], "This message has no generated document"
        )

    def test_returns_404_for_a_chat_the_user_does_not_own(self):
        response = self.client.get("/chats/chat-9/messages/message-1/document")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
