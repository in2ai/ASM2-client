"""Stopping a turn is deliberate, and only a deliberate ask stops it.

A reader who loses their connection keeps the answer -- the turn runs on and
writes itself to the conversation, which is what `_running_turns` is for. A
reader who presses stop is asking for the work itself to end, and that is what
POST /chats/{id}/turn/cancel does.
"""

import asyncio
import json
import unittest

import httpx

import server
from src.config.logto_auth import AuthInfo

CANCEL_ROUTE = "/chats/{chat_id}/turn/cancel"
STREAM_ROUTE = "/chats/{chat_id}/messages/stream"


class FakeChatStore:
    def __init__(self):
        self.appended = []
        self.status_updates = []

    def set_message_status(self, user_id, chat_id, message_id, status):
        self.status_updates.append((user_id, chat_id, message_id, status))

    def get_chat(self, user_id, chat_id):
        if user_id != "user-1" or chat_id != "chat-1":
            return None

        return {"id": chat_id, "title": chat_id, "messages": []}

    def append_message(self, user_id, chat_id, role, content, **kwargs):
        self.appended.append((chat_id, role, content))

        return {
            "id": f"{chat_id}-{len(self.appended)}",
            "chat_id": chat_id,
            "role": role,
            "content": content,
            "created_at": "2026-05-13T12:30:00Z",
            "status": kwargs.get("status"),
            "metadata": kwargs.get("metadata"),
        }


def read_events(body: str):
    """The (name, payload) pairs of an SSE body, keep-alives dropped."""
    events = []

    for block in body.split("\n\n"):
        lines = [line for line in block.splitlines() if not line.startswith(":")]

        if not lines:
            continue

        name = next(l.removeprefix("event: ") for l in lines if l.startswith("event: "))
        data = next(l.removeprefix("data: ") for l in lines if l.startswith("data: "))
        events.append((name, json.loads(data)))

    return events


class CancelChatTurnTests(unittest.TestCase):
    def setUp(self):
        server.app.state.tsdb_chat_store = FakeChatStore()
        auth = AuthInfo(sub="user-1", role="user", roles=["user"], audience=[])

        for route in server.app.routes:
            if getattr(route, "path", "") in (CANCEL_ROUTE, STREAM_ROUTE):
                dependency = route.dependant.dependencies[0].call
                server.app.dependency_overrides[dependency] = lambda: auth

        self._ready = server._ensure_ready_to_chat
        self._turn = server._run_chat_turn
        self._store_turn = server._store_chat_turn
        server._ensure_ready_to_chat = lambda auth: {"drive": object()}
        server._store_chat_turn = lambda store, user, chat_id, message, result: result

    def tearDown(self):
        server.app.dependency_overrides.clear()
        server._ensure_ready_to_chat = self._ready
        server._run_chat_turn = self._turn
        server._store_chat_turn = self._store_turn
        server._turns_by_chat.clear()

    def test_cancelling_ends_the_turn_and_says_so_on_the_stream(self):
        started = asyncio.Event()
        finished = asyncio.Event()

        async def fake_turn(auth, chat_id, query, sources, on_progress=None):
            on_progress({"phase": "searching"})
            started.set()
            try:
                # Long enough that only the cancellation can end it.
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                finished.set()
                raise

            return {}

        server._run_chat_turn = fake_turn

        async def scenario():
            transport = httpx.ASGITransport(app=server.app)

            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                ask = asyncio.create_task(
                    client.post("/chats/chat-1/messages/stream", json={"content": "q"})
                )

                await asyncio.wait_for(started.wait(), 5)
                cancelled = await client.post("/chats/chat-1/turn/cancel")

                response = await asyncio.wait_for(ask, 5)
                return cancelled.status_code, read_events(response.text)

        status, events = asyncio.run(scenario())

        self.assertEqual(status, 204)
        self.assertTrue(finished.is_set(), "the turn was never cancelled")

        names = [name for name, _ in events]
        self.assertIn("progress", names)
        self.assertIn("cancelled", names)
        # Nothing was answered, so nothing must claim to have been.
        self.assertNotIn("result", names)
        self.assertNotIn("error", names)
        self.assertEqual(server.app.state.tsdb_chat_store.status_updates, [
            ('user-1', 'chat-1', 'chat-1-1', 'cancelled')
        ])

    def test_cancelling_with_nothing_running_is_not_an_error(self):
        async def scenario():
            transport = httpx.ASGITransport(app=server.app)

            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                return await client.post("/chats/chat-1/turn/cancel")

        # "Nothing is running" is the state the caller asked for.
        self.assertEqual(asyncio.run(scenario()).status_code, 204)

    def test_overlapping_turns_are_rejected_before_persisting_the_question(self):
        async def scenario(stream_first):
            started = asyncio.Event()

            async def fake_turn(*args, **kwargs):
                started.set()
                await asyncio.sleep(30)

            server._run_chat_turn = fake_turn
            auth = AuthInfo(sub="user-1", role="user", roles=["user"], audience=[])
            payload = server.SendMessageRequestModel(content="first question")
            endpoint = (
                server.stream_chat_message if stream_first else server.send_chat_message
            )
            request = asyncio.create_task(endpoint(auth, "chat-1", payload))
            await asyncio.wait_for(started.wait(), 5)
            first = server._turns_by_chat[(auth.sub, "chat-1")]
            appended = len(server.app.state.tsdb_chat_store.appended)

            try:
                for other_endpoint in (
                    server.stream_chat_message,
                    server.send_chat_message,
                ):
                    with self.assertRaises(server.HTTPException) as raised:
                        await other_endpoint(auth, "chat-1", payload)
                    self.assertEqual(raised.exception.status_code, 409)
                    self.assertIs(server._turns_by_chat[(auth.sub, "chat-1")], first)
                    self.assertEqual(
                        len(server.app.state.tsdb_chat_store.appended), appended
                    )

                await server.cancel_chat_turn(auth, "chat-1")
                await asyncio.gather(first, request, return_exceptions=True)
                self.assertTrue(first.cancelled())
                server._ensure_no_running_turn(auth.sub, "chat-1")
                self.assertNotIn((auth.sub, "chat-1"), server._turns_by_chat)
            finally:
                first.cancel()
                await asyncio.gather(first, request, return_exceptions=True)

        for stream_first in (True, False):
            with self.subTest(stream_first=stream_first):
                asyncio.run(scenario(stream_first))

    def test_a_turn_in_another_conversation_is_left_alone(self):
        async def scenario():
            transport = httpx.ASGITransport(app=server.app)

            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                return await client.post("/chats/chat-2/turn/cancel")

        # chat-2 is not this user's, so the route never reaches a turn.
        self.assertEqual(asyncio.run(scenario()).status_code, 404)


if __name__ == "__main__":
    unittest.main()
