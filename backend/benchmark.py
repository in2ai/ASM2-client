import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import json
import os
from pathlib import Path
import threading
import time
import traceback
from typing import Any

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
import numpy as np
import openai
import pandas as pd
from ragas.embeddings.base import embedding_factory
from ragas.llms.base import llm_factory
from ragas.metrics.collections import ContextPrecision, ContextRecall, AnswerRelevancy, Faithfulness
from ragas.metrics.collections.answer_relevancy.util import AnswerRelevanceInput, AnswerRelevanceOutput
from ragas.metrics.result import MetricResult
from langgraph.checkpoint.memory import MemorySaver

from graph.agent import build_graph
from graph.model import get_llm_with_tools
from src.connectors.embeddings import get_configured_embeddings
from src.connectors.llms import get_configured_judge_llm, get_configured_llm
from src.connectors.store import get_vectordb

from src.metrics.connection import (
    get_pg_pool,
)
from src.utils.nlp import init_nlp

from src.utils.rag import get_reranker


load_dotenv()
init_nlp()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")

async def lifespan():
    # Global shared data
    llm = get_configured_llm()
    llm_with_tools = get_llm_with_tools(llm)
    judge_llm = get_configured_judge_llm()
    vectorstore = get_vectordb(get_configured_embeddings())
    reranker = get_reranker()
    pg_pool = get_pg_pool()

    graph_working_memory_saver = MemorySaver()
    graph = build_graph(checkpointer=graph_working_memory_saver)

    return llm, llm_with_tools, judge_llm, vectorstore, reranker, pg_pool, graph

LLM, LLM_WITH_TOOLS, JUDGE_LLM, VDB, RERANKER, PG_POOL, GRAPH = asyncio.run(lifespan())
ADMIN_SOURCES = {}

QA_CSV_PATH = Path("/app/benchmark/data/dataset_asm2.csv")
RESULTS_CSV_PATH = Path("/app/benchmark/results/rag_evaluation_results.csv")
QUERY_TIMING_CSV_PATH = Path("/app/benchmark/results/query_timings.csv")
BATCH_TIMING_CSV_PATH = Path("/app/benchmark/results/batch_timings.csv")
SUMMARY_CSV_PATH = Path("/app/benchmark/results/rag_evaluation_summary.csv")

BENCHMARK_SOURCES: list[str] = ["squad2.0"] # narrativeqa, squad2.0

EVAL_LLM_PROVIDER = "openai" # Evaluation LLM provider: "openai" or "together"
EVAL_LLM_CONFIG = {
    "openai": {
        "model": "gpt-4o-mini",
        "base_url": None,
        "api_key": OPENAI_API_KEY,
    },
    "together": {
        "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        "base_url": "https://api.together.xyz/v1",
        "api_key": TOGETHER_API_KEY,
    },
}
EVAL_LLM_MAX_TOKENS = 4096
EVAL_EMBEDDINGS_MODEL = "text-embedding-3-small"

NUM_EVALUATIONS = 1
MAX_RETRIES = 50
BATCH_SIZE = 4
RAG_EXECUTOR = ThreadPoolExecutor(max_workers=BATCH_SIZE)
METRIC_EXECUTOR = ThreadPoolExecutor(max_workers=BATCH_SIZE * 4)


class AnswerRelevancyWithFlag(AnswerRelevancy):
    """AnswerRelevancy that also exposes whether the answer was noncommittal.

    RAGAS computes a `noncommittal` flag (evasive answers such as "I couldn't find
    info") to zero out the score, but then discards it. This subclass reimplements
    ascore() identically to RAGAS 0.4.3 and attaches that flag to the MetricResult
    (`result.noncommittal`), so callers can tell a real answer from a refusal
    independently of the relevance score. Coupled to RAGAS 0.4.3 internals.
    """

    async def ascore(self, user_input: str, response: str) -> MetricResult:
        """Score answer relevancy and attach the noncommittal flag to the result."""
        if not user_input:
            raise ValueError("user_input cannot be empty")
        if not response:
            raise ValueError("response cannot be empty")

        generated_questions = []
        noncommittal_flags = []

        for _ in range(self.strictness):
            input_data = AnswerRelevanceInput(response=response)
            prompt_string = self.prompt.to_string(input_data)
            result = await self.llm.agenerate(prompt_string, AnswerRelevanceOutput)

            if result.question:
                generated_questions.append(result.question)
                noncommittal_flags.append(result.noncommittal)

        if not generated_questions:
            r = MetricResult(value=0.0)
            r.noncommittal = None
            return r

        all_noncommittal = np.all(noncommittal_flags)

        question_vec = np.asarray(
            await self.embeddings.aembed_text(user_input)
        ).reshape(1, -1)

        gen_question_vec = np.asarray(
            await self.embeddings.aembed_texts(generated_questions)
        ).reshape(len(generated_questions), -1)

        norm = np.linalg.norm(gen_question_vec, axis=1) * np.linalg.norm(
            question_vec, axis=1
        )
        cosine_sim = np.dot(gen_question_vec, question_vec.T).reshape(-1) / norm

        score = cosine_sim.mean() * int(not all_noncommittal)

        r = MetricResult(value=float(score))
        r.noncommittal = bool(all_noncommittal)
        return r


_thread_local = threading.local()


def _build_thread_metrics() -> dict[str, Any]:
    """Build a metrics dict backed by a per-thread OpenAI client.

    Each worker thread gets its own client so its connection pool is only ever
    used on that thread's own event loop.
    """
    cfg = EVAL_LLM_CONFIG[EVAL_LLM_PROVIDER]
    llm_client = openai.AsyncOpenAI(
        api_key=cfg["api_key"],
        base_url=cfg["base_url"],
        timeout=60.0,
    )
    eval_llm = llm_factory(cfg["model"], client=llm_client, max_tokens=EVAL_LLM_MAX_TOKENS)

    emb_client = (
        llm_client
        if EVAL_LLM_PROVIDER == "openai"
        else openai.AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=60.0)
    )
    eval_embeddings = embedding_factory("openai", model=EVAL_EMBEDDINGS_MODEL, client=emb_client)
    return {
        "context_precision": ContextPrecision(llm=eval_llm),
        "context_recall": ContextRecall(llm=eval_llm),
        "answer_relevancy": AnswerRelevancyWithFlag(
            llm=eval_llm,
            embeddings=eval_embeddings,
            strictness=3,
        ),
        "faithfulness": Faithfulness(llm=eval_llm),
    }


def _get_thread_eval_ctx() -> tuple[Any, dict[str, Any]]:
    """Return the current worker thread's (event loop, metrics), creating them once.

    The loop and client are created lazily per thread and reused across all
    metric calls made by that thread.
    """
    ctx = getattr(_thread_local, "eval_ctx", None)
    if ctx is None:
        loop = asyncio.new_event_loop()
        metrics = _build_thread_metrics()
        ctx = (loop, metrics)
        _thread_local.eval_ctx = ctx
    return ctx


def get_vectordb_search_output_in_latest_turn(messages: list[Any]) -> tuple[bool, Any | None]:
    """Report the vectordb_search outcome of the latest conversation turn.

    Scans the messages after the last HumanMessage for a vectordb_search tool call
    and its matching ToolMessage. Returns (retrieval_done, search_output):
    - retrieval_done: True if the tool was called this turn, regardless of result.
    - search_output: the parsed tool result (a dict with "chunks") when chunks were
      returned; None when the tool returned a fallback/error string or no search ran.

    The two together separate "no retrieval" (False, None) from "retrieval with no
    relevant chunks" (True, None).
    """

    last_human_index = next(
        (
            i
            for i in range(len(messages) - 1, -1, -1)
            if isinstance(messages[i], HumanMessage)
        ),
        -1,
    )

    if last_human_index == -1:
        return False, None

    retrieval_done = False

    for i in range(last_human_index + 1, len(messages)):
        message = messages[i]

        if not isinstance(message, AIMessage):
            continue

        for tool_call in message.tool_calls or []:
            if tool_call.get("name") != "vectordb_search":
                continue

            retrieval_done = True
            call_id = tool_call.get("id")

            for followup in messages[i + 1:]:
                if isinstance(followup, ToolMessage) and followup.tool_call_id == call_id:
                    try:
                        return True, json.loads(followup.content)

                    except (json.JSONDecodeError, TypeError):
                        return True, None

    return retrieval_done, None


def call_rag(query: str, thread_id: str) -> tuple[str, bool, Any | None]:
    """Run the RAG graph for a query."""
    config: dict[str, Any] = {
        "configurable": {
            "thread_id": thread_id,
            "llm": LLM,
            "llm_with_tools": LLM_WITH_TOOLS,
            "judge_llm": JUDGE_LLM,
            "vectorstore": VDB,
            "reranker": RERANKER,
            "pg_pool": PG_POOL,
            "sources": ADMIN_SOURCES,
        }
    }

    result = GRAPH.invoke(
        {"messages": [HumanMessage(content=query)]}, config
    )

    messages = result.get("messages") or []
    answer = str(messages[-1].content)
    retrieval_done, search_results = get_vectordb_search_output_in_latest_turn(messages)

    return answer, retrieval_done, search_results


def eval_dataset(
    query: str,
    relevant_docs: list[Any],
    answer: str,
    reference_answer: str,
    eval_id: int,
) -> dict[str, Any]:
    """Score the answer with RAGAS metrics."""
    print(f"[BENCHMARK][eval_id={eval_id}] Evaluating all metrics in parallel...")

    def run_metric(args):
        """Run one metric with retries and backoff; return (name, result) or (name, exception)."""
        name, kwargs = args

        for attempt in range(MAX_RETRIES):
            try:
                loop, metrics = _get_thread_eval_ctx()
                return name, loop.run_until_complete(metrics[name].ascore(**kwargs))

            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    return name, e
                
                backoff = min(2 ** attempt, 8)
                print(
                    f"[BENCHMARK][eval_id={eval_id}][run_metric] metric={name} attempt {attempt + 1}/{MAX_RETRIES} "
                    f"failed ({type(e).__name__}); retrying in {backoff}s"
                )
                time.sleep(backoff)

    tasks = [
        ("answer_relevancy", {"user_input": query, "response": answer}),
    ]

    if relevant_docs:
        tasks += [
            (
                "context_precision",
                {"user_input": query, "retrieved_contexts": relevant_docs, "reference": reference_answer},
            ),
            (
                "context_recall",
                {"user_input": query, "retrieved_contexts": relevant_docs, "reference": reference_answer},
            ),
            (
                "faithfulness",
                {"user_input": query, "response": answer, "retrieved_contexts": relevant_docs},
            ),
        ]

    futures = [METRIC_EXECUTOR.submit(run_metric, task) for task in tasks]
    results = dict(f.result(timeout=180) for f in futures)

    print(f"[BENCHMARK][eval_id={eval_id}] Evaluation Results:")

    for name, result in results.items():
        if isinstance(result, Exception):
            print(f"[BENCHMARK][eval_id={eval_id}] {name}: ERROR -> {type(result).__name__}: {result}")

        else:
            print(f"[BENCHMARK][eval_id={eval_id}] {name}: {result.value}")

    return results


def metric_value_or_none(result: MetricResult | Exception | None) -> float | None:
    """Return the metric's value, or None if it errored or is missing."""
    if result is None or isinstance(result, Exception):
        return None
    return result.value


def answered_flag(result: MetricResult | Exception | None) -> int | None:
    """Return 1 if the answer was committal, 0 if noncommittal (evasive), None if unknown."""
    if result is None or isinstance(result, Exception):
        return None
    noncommittal = getattr(result, "noncommittal", None)
    return None if noncommittal is None else int(not noncommittal)


def context_metric_value(results: dict[str, Any], key: str, retrieval: int) -> float | None:
    """Return the metric value when computed; 0.0 if retrieval ran without chunks; None if no retrieval."""
    if key in results:
        return metric_value_or_none(results[key])
    return 0.0 if retrieval else None


def append_result_row(
    output_path: Path,
    evaluation_id: int,
    source: str,
    results: dict[str, Any] | None,
    answer: str,
    retrieval: int,
):
    """Append one evaluation row to the results CSV."""
    file_exists = output_path.exists()

    with open(output_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        if not file_exists:
            writer.writerow([
                "evaluation_id",
                "source",
                "context_precision",
                "context_recall",
                "answer_relevancy",
                "faithfulness",
                "answered",
                "retrieval",
                "answer"
            ])

        if results is None:
            writer.writerow([evaluation_id, source, None, None, None, None, None, retrieval, answer])

        else:
            writer.writerow([
                evaluation_id,
                source,
                context_metric_value(results, "context_precision", retrieval),
                context_metric_value(results, "context_recall", retrieval),
                metric_value_or_none(results.get("answer_relevancy")),
                context_metric_value(results, "faithfulness", retrieval),
                answered_flag(results.get("answer_relevancy")),
                retrieval,
                answer
            ])

        f.flush()

    print(f"[BENCHMARK][eval_id={evaluation_id}] Saved results to CSV.")


def append_query_timing(evaluation_id: int, source: str, batch_id: int, start: float, query_timing_path: Path):
    """Append the elapsed time of a single query to the query-timing CSV."""
    elapsed_seconds = time.perf_counter() - start

    file_exists = query_timing_path.exists()

    with open(query_timing_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        if not file_exists:
            writer.writerow(["evaluation_id", "source", "batch_id", "elapsed_seconds"])
        writer.writerow([evaluation_id, source, batch_id, round(elapsed_seconds, 3)])
        f.flush()

    print(f"[BENCHMARK][eval_id={evaluation_id}] Total query time:\t{elapsed_seconds:.3f}s")


def append_batch_timing(batch_id: int, num_rows: int, batch_start: float, batch_timing_path: Path):
    """Append the elapsed time of a batch to the batch-timing CSV."""
    elapsed_seconds = time.perf_counter() - batch_start

    file_exists = batch_timing_path.exists()

    with open(batch_timing_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        if not file_exists:
            writer.writerow(["batch_id", "num_rows", "batch_elapsed_seconds"])
        writer.writerow([batch_id, num_rows, round(elapsed_seconds, 3)])
        f.flush()

    print(f"[BENCHMARK] Batch {batch_id} total time:\t{elapsed_seconds:.3f}s")


def sort_csv(path: Path, column_name: str):
    """Sort a CSV in place by the given column."""
    df = pd.read_csv(path)
    df = df.sort_values(column_name, ascending=True)
    df.to_csv(path, index=False)
    print(f"[BENCHMARK] Sorted {path.name} by {column_name}.")


def process_row(row: Any, run_attempt: int) -> tuple[Any, str, dict[str, Any] | None, str, bool, float]:
    """Evaluate one dataset row, retrying on failure."""
    attempt = 0
    results = None
    answer = ""
    chunks = None
    retrieval_done = False
    start = time.perf_counter()

    eval_id = row.evaluation_id
    source = row.source
    doc_id = row.document_id
    query = row.question
    reference_answer = row.answer1

    while attempt < MAX_RETRIES:
        try:
            if chunks is None:
                print(f"\n[BENCHMARK][eval_id={eval_id}] Document ID:\t {doc_id}")
                print(f"[BENCHMARK][eval_id={eval_id}] Query:\t\t {query}")
                print(f"[BENCHMARK][eval_id={eval_id}] Reference Answer:\t {reference_answer}")

                answer, retrieval_done, search_results = call_rag(
                    query,
                    thread_id=f"benchmark-{run_attempt}-{eval_id}-{attempt}",
                )

                print(f"[BENCHMARK][eval_id={eval_id}] Generated Answer:\t {answer}")

                chunks = search_results.get("chunks", []) if search_results else []

                if not retrieval_done:
                    print(
                        f"\n[BENCHMARK][eval_id={eval_id}] No retrieval for query={query} "
                        f"on document={doc_id}. Only answer_relevancy will be computed."
                    )

                elif not chunks:
                    print(
                        f"\n[BENCHMARK][eval_id={eval_id}] Retrieval done but no relevant chunks "
                        f"for query={query} on document={doc_id}. "
                        f"Only answer_relevancy will be computed."
                    )

                else:
                    print(f"[BENCHMARK][eval_id={eval_id}] Search Results:\t {len(chunks)}")

            print(f"\n[BENCHMARK][eval_id={eval_id}] Evaluating the generated answer...")
            results = eval_dataset(query, chunks, answer, reference_answer, eval_id)
            break

        except Exception as e:
            tb = traceback.format_exc()
            print(f"\n[BENCHMARK][eval_id={eval_id}] Error processing document={doc_id}: {type(e).__name__}: {e}")
            print(tb)
            attempt += 1

            if attempt < MAX_RETRIES:
                backoff = min(30.0, 2.0 ** attempt)
                print(
                    f"[BENCHMARK][eval_id={eval_id}] Retrying in {backoff:.0f}s... "
                    f"(attempt {attempt + 1}/{MAX_RETRIES})"
                )
                time.sleep(backoff)

    return eval_id, source, results, answer, retrieval_done, start


def benchmark_rag(run_attempt: int, results_path: Path, query_timing_path: Path, batch_timing_path: Path):
    """Run the benchmark over the dataset in batches, writing per-row results and timings."""
    qa_df = pd.read_csv(QA_CSV_PATH)

    if BENCHMARK_SOURCES:
        available = set(qa_df["source"].unique())
        unknown = set(BENCHMARK_SOURCES) - available
        if unknown:
            raise ValueError(
                f"Sources not found in the dataset: {sorted(unknown)}. "
                f"Available: {sorted(available)}."
            )
        qa_df = qa_df[qa_df["source"].isin(BENCHMARK_SOURCES)]
        print(
            f"[BENCHMARK] Filtered dataset to sources={BENCHMARK_SOURCES}: "
            f"{len(qa_df)} questions."
        )

    rows = list(qa_df.itertuples(index=False))

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        batch_id = i // BATCH_SIZE + 1
        batch_start = time.perf_counter()

        print(f"\n[BENCHMARK] Processing batch {batch_id} ({len(batch)} rows)...")

        futures = {RAG_EXECUTOR.submit(process_row, row, run_attempt): row for row in batch}

        for future in as_completed(futures):
            try:
                eval_id, source, results, answer, retrieval_done, start = future.result()
                append_result_row(results_path, eval_id, source, results, answer, 1 if retrieval_done else 0)
                append_query_timing(eval_id, source, batch_id, start, query_timing_path)

            except Exception as e:
                print(f"[BENCHMARK] Fatal error in row: {type(e).__name__}: {e}")

        append_batch_timing(batch_id, len(batch), batch_start, batch_timing_path)
        print(f"[BENCHMARK] Batch {batch_id} complete.")

    sort_csv(results_path, "evaluation_id")
    sort_csv(query_timing_path, "evaluation_id")


def summarize_evaluation(
    attempt: int,
    results_path: Path,
    query_timing_path: Path,
    batch_timing_path: Path,
    summary_path: Path,
):
    """Aggregate the results CSV into mean metrics per source and append the summary."""
    df_results = pd.read_csv(results_path)
    df_query_timings = pd.read_csv(query_timing_path)
    df_batch_timings = pd.read_csv(batch_timing_path)

    mean_batch_time = df_batch_timings["batch_elapsed_seconds"].mean()
    mean_query_time_by_source = df_query_timings.groupby("source")["elapsed_seconds"].mean()

    summary_rows = []
    for source, df_source in df_results.groupby("source"):
        df_retrieval = df_source[df_source["retrieval"] == 1]
        df_no_retrieval = df_source[df_source["retrieval"] == 0]
        answered_counts = df_source["answered"].value_counts()

        summary_rows.append({
            "attempt": attempt,
            "source": source,
            "num_retrieval": len(df_retrieval),
            "num_no_retrieval": len(df_no_retrieval),
            "mean_context_precision": df_retrieval["context_precision"].mean(),
            "mean_context_recall": df_retrieval["context_recall"].mean(),
            "mean_faithfulness": df_retrieval["faithfulness"].mean(),
            "mean_answer_relevancy_retrieval": df_retrieval["answer_relevancy"].mean(),
            "mean_answer_relevancy_no_retrieval": df_no_retrieval["answer_relevancy"].mean(),
            "num_answered": answered_counts.get(1, 0),
            "num_not_answered": answered_counts.get(0, 0),
            "mean_query_time_seconds": mean_query_time_by_source.get(source, float("nan")),
            "mean_batch_time_seconds": mean_batch_time,
        })

    df_summary = pd.DataFrame(summary_rows)

    file_exists = summary_path.exists()
    df_summary.to_csv(summary_path, mode="a", header=not file_exists, index=False)
    print(
        f"[BENCHMARK] Appended evaluation summary for attempt {attempt} "
        f"({len(summary_rows)} source(s)) to {summary_path}."
    )


def run_evaluation(attempt: int):
    """Run one benchmark attempt (with per-attempt output files) and write its summary."""
    token = "-".join(sorted(BENCHMARK_SOURCES)) if BENCHMARK_SOURCES else "all"
    suffix = f"_{token}_attempt_{attempt}"
    results_path = RESULTS_CSV_PATH.with_stem(f"{RESULTS_CSV_PATH.stem}{suffix}")
    query_timing_path = QUERY_TIMING_CSV_PATH.with_stem(f"{QUERY_TIMING_CSV_PATH.stem}{suffix}")
    batch_timing_path = BATCH_TIMING_CSV_PATH.with_stem(f"{BATCH_TIMING_CSV_PATH.stem}{suffix}")
    summary_path = SUMMARY_CSV_PATH.with_stem(f"{SUMMARY_CSV_PATH.stem}_{token}")

    benchmark_rag(attempt, results_path, query_timing_path, batch_timing_path)
    summarize_evaluation(attempt, results_path, query_timing_path, batch_timing_path, summary_path)


def main():
    """Entry point: run the configured number of evaluation attempts."""
    RESULTS_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(1, NUM_EVALUATIONS + 1):
        print(f"\n[BENCHMARK] ===== RAG evaluation run {attempt}/{NUM_EVALUATIONS} =====")
        run_evaluation(attempt)


if __name__ == "__main__":
    main()
