import json
import unittest

from fastapi.testclient import TestClient

import server
from src.config.logto_auth import AuthInfo

STREAM_ROUTE = "/chats/{chat_id}/messages/stream"

CHAT = {
    "id": "chat-1",
    "title": "New conversation",
    "created_at": "2026-05-13T12:00:00Z",
    "updated_at": "2026-05-13T12:30:00Z",
    "pinned": False,
    "archived": False,
    "last_message_preview": "Here is the report.",
    "messages": [],
}

MESSAGE = {
    "id": "message-1",
    "chat_id": "chat-1",
    "role": "user",
    "content": "How many holidays do I have?",
    "created_at": "2026-05-13T12:30:00Z",
    "status": "sent",
    "metadata": None,
}


class FakeChatStore:
    def __init__(self):
        self.appended = []

    def get_chat(self, user_id, chat_id):
        if (user_id, chat_id) != ("user-1", "chat-1"):
            return None

        return CHAT

    def append_message(self, user_id, chat_id, role, content, **kwargs):
        self.appended.append((role, content))

        return {
            **MESSAGE,
            "id": f"message-{len(self.appended)}",
            "role": role,
            "content": content,
            "status": kwargs.get("status"),
            "metadata": kwargs.get("metadata"),
        }


def override_auth(auth: AuthInfo) -> None:
    """Point the route's auth dependency at a fixed identity."""

    for route in server.app.routes:
        if getattr(route, "path", "") == STREAM_ROUTE:
            dependency = route.dependant.dependencies[0].call
            server.app.dependency_overrides[dependency] = lambda: auth


def read_events(response) -> list[tuple[str, dict]]:
    """The (name, payload) pairs of an SSE body, keep-alives dropped."""

    events = []

    for block in response.text.split("\n\n"):
        lines = [line for line in block.splitlines() if not line.startswith(":")]

        if not lines:
            continue

        name = next(l.removeprefix("event: ") for l in lines if l.startswith("event: "))
        data = next(l.removeprefix("data: ") for l in lines if l.startswith("data: "))
        events.append((name, json.loads(data)))

    return events


class StreamChatMessageTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store
        override_auth(AuthInfo(sub="user-1", role="user", roles=["user"], audience=[]))
        self.client = TestClient(server.app)

        self._ready = server._ensure_ready_to_chat
        self._turn = server._run_chat_turn
        server._ensure_ready_to_chat = lambda auth: {"drive": object()}

    def tearDown(self):
        server.app.dependency_overrides.clear()
        server._ensure_ready_to_chat = self._ready
        server._run_chat_turn = self._turn

    def run_turn_with(self, progress, result=None, failure=None):
        async def fake_turn(auth, chat_id, query, sources, on_progress=None):
            for event in progress:
                on_progress(event)

            if failure is not None:
                raise failure

            return result

        server._run_chat_turn = fake_turn

    def post(self):
        return self.client.post(
            "/chats/chat-1/messages/stream",
            json={"content": "How many holidays do I have?"},
        )

    def test_reports_progress_before_the_finished_answer(self):
        self.run_turn_with(
            progress=[
                {"phase": "understanding"},
                {"phase": "searching", "searches": 3},
            ],
            result={
                "answer": "You have 23 days.",
                "detected_lang": "en",
                "sources": [],
                "document": None,
            },
        )

        response = self.post()
        events = read_events(response)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/event-stream"))
        self.assertEqual(
            [(name, data.get("phase")) for name, data in events[:-1]],
            [("progress", "understanding"), ("progress", "searching")],
        )
        self.assertEqual(events[0][1], {"phase": "understanding"})
        self.assertEqual(events[1][1], {"phase": "searching", "searches": 3})

        name, turn = events[-1]
        self.assertEqual(name, "result")
        self.assertEqual(turn["assistant_message"]["content"], "You have 23 days.")
        self.assertEqual(turn["user_message"]["content"], "How many holidays do I have?")
        self.assertEqual(turn["detected_lang"], "en")
        self.assertEqual(turn["chat"]["id"], "chat-1")

    def test_saves_the_question_and_then_the_answer(self):
        self.run_turn_with(
            progress=[],
            result={
                "answer": "You have 23 days.",
                "detected_lang": "en",
                "sources": [],
                "document": None,
            },
        )

        self.post()

        self.assertEqual(
            self.store.appended,
            [
                ("user", "How many holidays do I have?"),
                ("assistant", "You have 23 days."),
            ],
        )

    def test_a_failed_turn_ends_in_an_error_event(self):
        self.run_turn_with(
            progress=[{"phase": "thinking"}],
            failure=RuntimeError("the model is down"),
        )

        events = read_events(self.post())

        self.assertEqual(events[0][0], "progress")
        self.assertEqual(
            events[-1],
            ("error", {"detail": "Internal error processing your request"}),
        )

    def test_is_404_for_a_chat_owned_by_someone_else(self):
        self.run_turn_with(progress=[], result=None)

        response = self.client.post(
            "/chats/chat-9/messages/stream", json={"content": "hello"}
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.store.appended, [])

    def test_rejects_an_empty_message_before_saving_anything(self):
        response = self.client.post(
            "/chats/chat-1/messages/stream", json={"content": "   "}
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.store.appended, [])


if __name__ == "__main__":
    unittest.main()
