from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch
import pytest

from langchain_core.documents import Document

from graph.tools import vectordb_search
from src.utils import rag


def chunk(file_id, index, text, source="drive", link=None):
    return Document(page_content=text, metadata={
        "id": file_id, "source": source, "chunk_idx": index, "page": index + 1,
        "path": f"{file_id}.txt", "permissions": {"link": link},
    })


class Source:
    display_name = "Drive"

    def __init__(self, allowed=True):
        self.calls = []
        self.allowed = allowed

    def has_access(self, file_id, metadata):
        self.calls.append((file_id, metadata["permissions"].get("link")))
        return self.allowed


def test_parallel_subsearches_check_each_file_and_judge_each_text_once():
    source = Source()
    chunks = [
        chunk("a", 0, "first"),
        chunk("a", 1, "shared text"),
        chunk("b", 0, "shared text"),
    ]
    judged = []
    contexts = []

    def context(_, candidates, __):
        contexts.append(candidates[:])
        return "\n".join(c.page_content for c in candidates)

    with (
        patch.dict("os.environ", {"BENCHMARK": "false", "USE_RERANKER": "false", "LONG_CONTEXT": "false"}),
        patch("src.utils.rag.detect_language", return_value="en"),
        patch("src.utils.rag.hybrid_search", return_value=chunks) as searches,
        patch("graph.tools.generate_subqueries", return_value=SimpleNamespace(queries=["original", "extra", "extra"])),
        patch("graph.tools.is_relevant_source", side_effect=lambda _, query, text: judged.append(text) or SimpleNamespace(is_relevant=True)),
        patch("graph.tools.is_context_enough", return_value=SimpleNamespace(is_enough=True)),
        patch("graph.tools.format_context", side_effect=context),
        patch("src.metrics.metrics.insert_metric"),
    ):
        _, artifact = vectordb_search.func("original", {"configurable": {
            "llm": SimpleNamespace(model_copy=lambda **_: object()),
            "vectorstore": object(), "reranker": None, "sources": {"drive": source},
        }})

    assert searches.call_count == 2
    assert Counter(judged) == Counter(["first", "shared text"])
    assert source.calls == [("a", None), ("b", None)]
    assert {(c.metadata["id"], c.metadata["chunk_idx"]) for c in contexts[0]} == {("a", 0), ("a", 1), ("b", 0)}
    assert {s["id"] for s in artifact["sources"]} == {"a", "b"}


def test_later_round_keeps_identical_text_from_a_different_file():
    source = Source()
    a, b = chunk("a", 0, "same text"), chunk("b", 0, "same text")
    candidates = []
    with (
        patch.dict("os.environ", {"BENCHMARK": "false", "USE_RERANKER": "false", "LONG_CONTEXT": "false"}),
        patch("src.utils.rag.detect_language", return_value="en"),
        patch("src.utils.rag.hybrid_search", side_effect=lambda _, query, *args: [a] if query == "original" else [b]),
        patch("graph.tools.generate_subqueries", side_effect=[SimpleNamespace(queries=[]), SimpleNamespace(queries=["next"])]),
        patch("graph.tools.is_relevant_source", return_value=SimpleNamespace(is_relevant=True)) as relevance,
        patch("graph.tools.is_context_enough", side_effect=[SimpleNamespace(is_enough=False, reason="missing second file"), SimpleNamespace(is_enough=True)]),
        patch("graph.tools.format_context", side_effect=lambda _, docs, __: candidates.append(docs[:]) or "context"),
        patch("src.metrics.metrics.insert_metric"),
    ):
        _, artifact = vectordb_search.func("original", {"configurable": {
            "llm": SimpleNamespace(model_copy=lambda **_: object()),
            "vectorstore": object(), "reranker": None, "sources": {"drive": source},
        }})
    assert relevance.call_count == 1
    assert {c.metadata["id"] for c in candidates[-1]} == {"a", "b"}
    assert {s["id"] for s in artifact["sources"]} == {"a", "b"}


def test_permission_denial_is_checked_once_and_all_chunks_are_excluded():
    source = Source(allowed=False)
    docs = [chunk("private", index, str(index)) for index in range(4)]
    with (
        patch.dict("os.environ", {"BENCHMARK": "false", "USE_RERANKER": "false"}),
        patch("src.utils.rag.detect_language", return_value="en"),
        patch("src.utils.rag.hybrid_search", return_value=docs),
    ):
        allowed, _ = rag.retrieve_and_rerank("query", object(), None, {"drive": source})
    assert allowed == []
    assert source.calls == [("private", None)]


def test_shared_links_for_the_same_file_have_separate_access_decisions():
    source = Source()
    source.has_access = lambda file_id, metadata: metadata["permissions"]["link"] == "allowed-link"
    denied = chunk("same-id", 0, "denied", "dropbox", "denied-link")
    allowed = chunk("same-id", 1, "allowed", "dropbox", "allowed-link")
    with (
        patch.dict("os.environ", {"BENCHMARK": "false", "USE_RERANKER": "false"}),
        patch("src.utils.rag.detect_language", return_value="en"),
        patch("src.utils.rag.hybrid_search", return_value=[denied, allowed]),
    ):
        actual, _ = rag.retrieve_and_rerank("query", object(), None, {"dropbox": source})
    assert actual == [allowed]


def test_permission_results_are_shared_by_searches_but_not_by_turns():
    source = Source()
    docs = [chunk("a", 0, "first"), chunk("a", 1, "second")]
    checks = rag.RequestPermissions({"drive": source})
    with (
        patch.dict("os.environ", {"BENCHMARK": "false", "USE_RERANKER": "false"}),
        patch("src.utils.rag.detect_language", return_value="en"),
        patch("src.utils.rag.hybrid_search", return_value=docs),
    ):
        for query in ["first search", "follow-up search"]:
            actual, _ = rag.retrieve_and_rerank(query, object(), None, {"drive": source}, permission_checks=checks)
            assert actual == docs
        assert source.calls == [("a", None)]

        source.allowed = False
        next_turn = rag.RequestPermissions({"drive": source})
        actual, _ = rag.retrieve_and_rerank("next turn", object(), None, {"drive": source}, permission_checks=next_turn)
        assert actual == []
        assert source.calls == [("a", None), ("a", None)]


def test_parallel_access_checks_share_one_live_request():
    source = Source()
    checks = rag.RequestPermissions({"drive": source})
    docs = [chunk("a", index, str(index)) for index in range(20)]
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert all(executor.map(lambda doc: checks.has_access(doc.metadata), docs))
    assert source.calls == [("a", None)]


def test_permission_results_do_not_cross_users_or_providers():
    owner, other = Source(), Source(allowed=False)
    metadata = chunk("same-id", 0, "text").metadata
    assert rag.RequestPermissions({"drive": owner}).has_access(metadata)
    assert not rag.RequestPermissions({"drive": other}).has_access(metadata)
    checks = rag.RequestPermissions({"drive": owner, "dropbox": other})
    assert checks.has_access(metadata)
    assert not checks.has_access({**metadata, "source": "dropbox"})


def test_folder_link_paths_have_separate_access_decisions():
    source = Source()
    source.has_access = lambda file_id, metadata: metadata["permissions"].get("link_path") == "/right-file"
    checks = rag.RequestPermissions({"dropbox": source})
    metadata = chunk("a", 0, "text", "dropbox", "folder-link").metadata
    assert not checks.has_access({**metadata, "permissions": {"link": "folder-link", "link_path": "/wrong-file"}})
    assert checks.has_access({**metadata, "permissions": {"link": "folder-link", "link_path": "/right-file"}})


def test_failed_permission_call_is_not_cached():
    source = Source()
    metadata = chunk("a", 0, "text").metadata
    checks = rag.RequestPermissions({"drive": source})
    with patch.object(source, "has_access", side_effect=[RuntimeError("temporary failure"), True]) as check:
        with pytest.raises(RuntimeError, match="temporary failure"):
            checks.has_access(metadata)
        assert checks.has_access(metadata)
        assert check.call_count == 2


def test_final_search_round_does_not_plan_queries_that_will_never_run():
    source = Source()
    with (
        patch.dict("os.environ", {"BENCHMARK": "false", "USE_RERANKER": "false", "LONG_CONTEXT": "false"}),
        patch("src.utils.rag.detect_language", return_value="en"),
        patch("src.utils.rag.hybrid_search", side_effect=lambda _, query, *args: [chunk(query, 0, query)]) as searches,
        patch("graph.tools.generate_subqueries", side_effect=[SimpleNamespace(queries=[]), SimpleNamespace(queries=["second"]), SimpleNamespace(queries=["third"]), SimpleNamespace(queries=["unused"])]) as planner,
        patch("graph.tools.is_relevant_source", return_value=SimpleNamespace(is_relevant=True)),
        patch("graph.tools.is_context_enough", return_value=SimpleNamespace(is_enough=False, reason="still missing")),
        patch("graph.tools.format_context", return_value="partial context"),
        patch("src.metrics.metrics.insert_metric"),
    ):
        vectordb_search.func("original", {"configurable": {
            "llm": SimpleNamespace(model_copy=lambda **_: object()),
            "vectorstore": object(), "reranker": None, "sources": {"drive": source},
        }})
    assert searches.call_count == 3
    assert planner.call_count == 3


def test_classifiers_use_configured_judge_while_planning_uses_main_model():
    main_model, judge_model = object(), object()
    with (
        patch("graph.tools.retrieve_safely", return_value=([chunk("a", 0, "text")], "en")),
        patch.dict("os.environ", {"LONG_CONTEXT": "false"}),
        patch("graph.tools.generate_subqueries", return_value=SimpleNamespace(queries=[])) as planner,
        patch("graph.tools.is_relevant_source", return_value=SimpleNamespace(is_relevant=True)) as relevance,
        patch("graph.tools.is_context_enough", return_value=SimpleNamespace(is_enough=True)) as sufficiency,
        patch("graph.tools.format_context", return_value="context"),
        patch("src.metrics.metrics.insert_metric"),
    ):
        vectordb_search.func("query", {"configurable": {
            "llm": SimpleNamespace(model_copy=lambda **_: main_model),
            "judge_llm": SimpleNamespace(model_copy=lambda **_: judge_model),
            "vectorstore": object(), "reranker": None, "sources": {},
        }})
    assert planner.call_args.args[0] is main_model
    assert relevance.call_args.args[0] is judge_model
    assert sufficiency.call_args.args[0] is judge_model
