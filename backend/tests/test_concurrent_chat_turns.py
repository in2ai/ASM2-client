"""Two conversations answering at the same time must not bleed into each other.

The product lets a user ask in one conversation and move on to another while
the first is still working, so every per-turn channel -- the progress stream
inside the graph, and the SSE queue outside it -- has to be per-run rather than
shared.
"""

import asyncio
import json
import unittest

import httpx
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

import server
from graph import progress
from src.config.logto_auth import AuthInfo


STREAM_ROUTE = "/chats/{chat_id}/messages/stream"


class TurnState(TypedDict):
    label: str


def build_emitting_graph(started: asyncio.Event, release: asyncio.Event):
    """A graph that reports two steps, pausing between them.

    The pause is what makes the runs overlap: neither can finish its second
    step until the other has started its first.
    """

    async def first(state: TurnState):
        progress.emit("searching", title=state["label"])
        started.set()
        await release.wait()

        return state

    async def second(state: TurnState):
        progress.emit("reading", title=state["label"])

        return state

    builder = StateGraph(TurnState)
    builder.add_node("first", first)
    builder.add_node("second", second)
    builder.add_edge(START, "first")
    builder.add_edge("first", "second")
    builder.add_edge("second", END)

    return builder.compile()


class ProgressIsolationTests(unittest.TestCase):
    """The graph's own progress channel, which routes by run context."""

    def test_two_overlapping_runs_never_see_each_other_steps(self):
        async def scenario():
            started_a, started_b = asyncio.Event(), asyncio.Event()
            release = asyncio.Event()
            graph_a = build_emitting_graph(started_a, release)
            graph_b = build_emitting_graph(started_b, release)

            async def run(graph, label):
                seen = []

                async for mode, chunk in graph.astream(
                    {"label": label}, stream_mode=["values", "custom"]
                ):
                    if mode == "custom":
                        seen.append(chunk)

                return seen

            task_a = asyncio.create_task(run(graph_a, "alpha"))
            task_b = asyncio.create_task(run(graph_b, "beta"))

            # Both are mid-run before either is allowed to continue.
            await asyncio.wait_for(started_a.wait(), 5)
            await asyncio.wait_for(started_b.wait(), 5)
            release.set()

            return await asyncio.gather(task_a, task_b)

        seen_a, seen_b = asyncio.run(scenario())

        self.assertEqual(
            seen_a,
            [
                {"phase": "searching", "title": "alpha"},
                {"phase": "reading", "title": "alpha"},
            ],
        )
        self.assertEqual(
            seen_b,
            [
                {"phase": "searching", "title": "beta"},
                {"phase": "reading", "title": "beta"},
            ],
        )


class FakeChatStore:
    """Accepts any chat id, so a test can hold several conversations."""

    def __init__(self):
        self.appended = []

    def get_chat(self, user_id, chat_id):
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


def turn_result(chat_id):
    message = {
        "id": f"{chat_id}-answer",
        "chat_id": chat_id,
        "role": "assistant",
        "content": f"answer for {chat_id}",
        "created_at": "2026-05-13T12:31:00Z",
        "status": None,
        "metadata": None,
    }

    return {
        "assistant_message": message,
        "chat": {
            "id": chat_id,
            "title": chat_id,
            "created_at": "2026-05-13T12:30:00Z",
            "updated_at": "2026-05-13T12:31:00Z",
            "last_message_preview": message["content"],
            "messages": [message],
        },
        "detected_lang": "es",
        "user_message": {
            "id": f"{chat_id}-question",
            "chat_id": chat_id,
            "role": "user",
            "content": "q",
            "created_at": "2026-05-13T12:30:00Z",
            "status": None,
            "metadata": None,
        },
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


class ConcurrentStreamEndpointTests(unittest.TestCase):
    """The SSE plumbing around the graph: one queue and one task per request."""

    def setUp(self):
        self.store = FakeChatStore()
        server.app.state.tsdb_chat_store = self.store

        auth = AuthInfo(sub="user-1", role="user", roles=["user"], audience=[])

        for route in server.app.routes:
            if getattr(route, "path", "") == STREAM_ROUTE:
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

    def test_each_conversation_receives_only_its_own_events(self):
        started = {"chat-1": asyncio.Event(), "chat-2": asyncio.Event()}
        release = asyncio.Event()

        async def fake_turn(auth, chat_id, query, sources, on_progress=None):
            # Interleave deliberately: report, wait for the other conversation
            # to report too, then finish. A shared channel would cross here.
            on_progress({"phase": "searching", "title": chat_id})
            started[chat_id].set()
            await release.wait()
            on_progress({"phase": "reading", "title": chat_id})

            return turn_result(chat_id)

        server._run_chat_turn = fake_turn

        async def scenario():
            transport = httpx.ASGITransport(app=server.app)

            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:

                async def ask(chat_id):
                    response = await client.post(
                        f"/chats/{chat_id}/messages/stream",
                        json={"content": "q"},
                    )

                    return read_events(response.text)

                task_1 = asyncio.create_task(ask("chat-1"))
                task_2 = asyncio.create_task(ask("chat-2"))

                await asyncio.wait_for(started["chat-1"].wait(), 5)
                await asyncio.wait_for(started["chat-2"].wait(), 5)
                release.set()

                return await asyncio.gather(task_1, task_2)

        events_1, events_2 = asyncio.run(scenario())

        for chat_id, events in (("chat-1", events_1), ("chat-2", events_2)):
            progress_titles = [
                payload["title"] for name, payload in events if name == "progress"
            ]
            results = [payload for name, payload in events if name == "result"]

            self.assertEqual(progress_titles, [chat_id, chat_id], chat_id)
            self.assertEqual(len(results), 1, chat_id)
            self.assertEqual(
                results[0]["assistant_message"]["content"], f"answer for {chat_id}"
            )

    def test_a_failing_turn_does_not_disturb_the_other_conversation(self):
        started = {"chat-1": asyncio.Event(), "chat-2": asyncio.Event()}
        release = asyncio.Event()

        async def fake_turn(auth, chat_id, query, sources, on_progress=None):
            on_progress({"phase": "searching", "title": chat_id})
            started[chat_id].set()
            await release.wait()

            if chat_id == "chat-1":
                raise RuntimeError("retrieval exploded")

            return turn_result(chat_id)

        server._run_chat_turn = fake_turn

        async def scenario():
            transport = httpx.ASGITransport(app=server.app)

            async with httpx.AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:

                async def ask(chat_id):
                    response = await client.post(
                        f"/chats/{chat_id}/messages/stream",
                        json={"content": "q"},
                    )

                    return read_events(response.text)

                task_1 = asyncio.create_task(ask("chat-1"))
                task_2 = asyncio.create_task(ask("chat-2"))

                await asyncio.wait_for(started["chat-1"].wait(), 5)
                await asyncio.wait_for(started["chat-2"].wait(), 5)
                release.set()

                return await asyncio.gather(task_1, task_2)

        events_1, events_2 = asyncio.run(scenario())

        self.assertEqual([name for name, _ in events_1], ["progress", "error"])
        # The healthy conversation still gets its answer.
        self.assertEqual([name for name, _ in events_2], ["progress", "result"])


if __name__ == "__main__":
    unittest.main()
