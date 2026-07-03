import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import json
import os
from pathlib import Path
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

from graph.agent import build_graph, get_checkpointer
from graph.model import get_llm_with_tools
from src.connectors.embeddings import get_configured_embeddings
from src.connectors.llms import get_configured_llm
from src.connectors.store import get_vectordb

from src.metrics.connection import get_pg_pool
from src.utils.nlp import init_nlp

from src.utils.rag import get_reranker


load_dotenv()
init_nlp()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY")

CLIENT_OPENAI = openai.AsyncOpenAI(
    api_key=OPENAI_API_KEY,
    timeout=60.0,
)
CLIENT_TOGETHER = openai.AsyncOpenAI(
    base_url="https://api.together.xyz/v1",
    api_key=TOGETHER_API_KEY,
    timeout=60.0,
)

LLM = get_configured_llm()
LLM_WITH_TOOLS = get_llm_with_tools(LLM)
VDB = get_vectordb(get_configured_embeddings())
RERANKER = get_reranker()
GRAPH = build_graph(get_checkpointer())
PG_POOL = get_pg_pool()
ADMIN_SOURCES = {}

# QA_CSV_PATH = Path("/app/benchmark_data/gutenberg_num_questions_5_num_documents_200_qaps.csv")
QA_CSV_PATH = Path("/app/benchmark_data/dataset_wikipedia_qa_5_docs_200.csv")
RESULTS_CSV_PATH = Path("/app/benchmark_data/rag_evaluation_results.csv")
QUERY_TIMING_CSV_PATH = Path("/app/benchmark_data/query_timings.csv")
BATCH_TIMING_CSV_PATH = Path("/app/benchmark_data/batch_timings.csv")
SUMMARY_CSV_PATH = Path("/app/benchmark_data/rag_evaluation_summary.csv")

EVAL_LLM = llm_factory(
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    client=CLIENT_TOGETHER,
    max_tokens=4096,
)
EVAL_EMBEDDINGS = embedding_factory("openai", model="text-embedding-3-small", client=CLIENT_OPENAI)

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


METRICS = {
    "context_precision": ContextPrecision(llm=EVAL_LLM),
    "context_recall": ContextRecall(llm=EVAL_LLM),
    "answer_relevancy": AnswerRelevancyWithFlag(
        llm=EVAL_LLM,
        embeddings=EVAL_EMBEDDINGS,
        strictness=3,
    ),
    "faithfulness": Faithfulness(llm=EVAL_LLM),
}


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
        """Run one metric with up to 3 retries; return (name, result) or (name, exception)."""
        name, fn, kwargs = args

        for attempt in range(3):
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                return name, fn(**kwargs)

            except Exception as e:
                if attempt == 2:
                    return name, e

            finally:
                loop.close()

    tasks = [
        ("answer_relevancy", METRICS["answer_relevancy"].score, {"user_input": query, "response": answer}),
    ]

    if relevant_docs:
        tasks += [
            (
                "context_precision",
                METRICS["context_precision"].score,
                {"user_input": query, "retrieved_contexts": relevant_docs, "reference": reference_answer},
            ),
            (
                "context_recall",
                METRICS["context_recall"].score,
                {"user_input": query, "retrieved_contexts": relevant_docs, "reference": reference_answer},
            ),
            (
                "faithfulness",
                METRICS["faithfulness"].score,
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
                "context_precision",
                "context_recall",
                "answer_relevancy",
                "faithfulness",
                "answered",
                "retrieval",
                "answer"
            ])

        if results is None:
            writer.writerow([evaluation_id, None, None, None, None, None, retrieval, answer])

        else:
            writer.writerow([
                evaluation_id,
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


def append_query_timing(evaluation_id: int, batch_id: int, start: float, query_timing_path: Path):
    """Append the elapsed time of a single query to the query-timing CSV."""
    elapsed_seconds = time.perf_counter() - start

    file_exists = query_timing_path.exists()

    with open(query_timing_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)

        if not file_exists:
            writer.writerow(["evaluation_id", "batch_id", "elapsed_seconds"])
        writer.writerow([evaluation_id, batch_id, round(elapsed_seconds, 3)])
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


def process_row(row: Any, run_attempt: int) -> tuple[Any, dict[str, Any] | None, str, bool, float]:
    """Evaluate one dataset row, retrying on failure."""
    attempt = 0
    results = None
    answer = ""
    chunks = None
    retrieval_done = False
    start = time.perf_counter()

    eval_id = row.evaluation_id
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

    return eval_id, results, answer, retrieval_done, start


def benchmark_rag(run_attempt: int, results_path: Path, query_timing_path: Path, batch_timing_path: Path):
    """Run the benchmark over the dataset in batches, writing per-row results and timings."""
    qa_df = pd.read_csv(QA_CSV_PATH)
    rows = list(qa_df.itertuples(index=False))

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        batch_id = i // BATCH_SIZE + 1
        batch_start = time.perf_counter()

        print(f"\n[BENCHMARK] Processing batch {batch_id} ({len(batch)} rows)...")

        futures = {RAG_EXECUTOR.submit(process_row, row, run_attempt): row for row in batch}

        for future in as_completed(futures):
            try:
                eval_id, results, answer, retrieval_done, start = future.result()
                append_result_row(results_path, eval_id, results, answer, 1 if retrieval_done else 0)
                append_query_timing(eval_id, batch_id, start, query_timing_path)

            except Exception as e:
                print(f"[BENCHMARK] Fatal error in row: {type(e).__name__}: {e}")

        append_batch_timing(batch_id, len(batch), batch_start, batch_timing_path)
        print(f"[BENCHMARK] Batch {batch_id} complete.")

    sort_csv(results_path, "evaluation_id")
    sort_csv(query_timing_path, "evaluation_id")


def summarize_evaluation(attempt: int, results_path: Path, query_timing_path: Path, batch_timing_path: Path):
    """Aggregate the results CSV into mean metrics per retrieval group and append the summary."""
    df_results = pd.read_csv(results_path)
    df_query_timings = pd.read_csv(query_timing_path)
    df_batch_timings = pd.read_csv(batch_timing_path)

    df_retrieval = df_results[df_results["retrieval"] == 1]
    df_no_retrieval = df_results[df_results["retrieval"] == 0]
    answered_counts = df_results["answered"].value_counts()

    mean_query_time = df_query_timings["elapsed_seconds"].mean()
    mean_batch_time = df_batch_timings["batch_elapsed_seconds"].mean()

    df_summary = pd.DataFrame([{
        "attempt": attempt,
        "num_retrieval": len(df_retrieval),
        "num_no_retrieval": len(df_no_retrieval),
        "mean_context_precision": df_retrieval["context_precision"].mean(),
        "mean_context_recall": df_retrieval["context_recall"].mean(),
        "mean_faithfulness": df_retrieval["faithfulness"].mean(),
        "mean_answer_relevancy_retrieval": df_retrieval["answer_relevancy"].mean(),
        "mean_answer_relevancy_no_retrieval": df_no_retrieval["answer_relevancy"].mean(),
        "num_answered": answered_counts.get(1, 0),
        "num_not_answered": answered_counts.get(0, 0),
        "mean_query_time_seconds": mean_query_time,
        "mean_batch_time_seconds": mean_batch_time,
    }])

    file_exists = SUMMARY_CSV_PATH.exists()
    df_summary.to_csv(SUMMARY_CSV_PATH, mode="a", header=not file_exists, index=False)
    print(f"[BENCHMARK] Appended evaluation summary for attempt {attempt} to {SUMMARY_CSV_PATH}.")


def run_evaluation(attempt: int):
    """Run one benchmark attempt (with per-attempt output files) and write its summary."""
    suffix = f"_attempt_{attempt}"
    results_path = RESULTS_CSV_PATH.with_stem(f"{RESULTS_CSV_PATH.stem}{suffix}")
    query_timing_path = QUERY_TIMING_CSV_PATH.with_stem(f"{QUERY_TIMING_CSV_PATH.stem}{suffix}")
    batch_timing_path = BATCH_TIMING_CSV_PATH.with_stem(f"{BATCH_TIMING_CSV_PATH.stem}{suffix}")

    benchmark_rag(attempt, results_path, query_timing_path, batch_timing_path)
    summarize_evaluation(attempt, results_path, query_timing_path, batch_timing_path)


def main():
    """Entry point: run the configured number of evaluation attempts."""
    num_evaluations = 3

    for attempt in range(1, num_evaluations + 1):
        print(f"\n[BENCHMARK] ===== RAG evaluation run {attempt}/{num_evaluations} =====")
        run_evaluation(attempt)


if __name__ == "__main__":
    main()
