import asyncio
import csv
import json
import math
import time
import traceback
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
import openai
from ragas.embeddings.base import embedding_factory
from ragas.llms.base import llm_factory
from ragas.metrics.collections import ContextPrecision, ContextRecall, AnswerRelevancy, Faithfulness

from src.utils.nlp import init_nlp
from graph.agent import build_graph, get_checkpointer
from graph.model import get_llm_with_tools
from src.connectors.embeddings import get_configured_embeddings
from src.connectors.llms import get_configured_llm
from src.connectors.store import get_vectordb
from src.metrics.connection import get_questdb_pool
from src.utils.rag import get_reranker


init_nlp()

client = openai.AsyncOpenAI(timeout=60.0)

LLM = get_configured_llm()
LLM_WITH_TOOLS = get_llm_with_tools(LLM)
VDB = get_vectordb(get_configured_embeddings())
RERANKER = get_reranker()
GRAPH = build_graph(get_checkpointer())
QUESTDB_POOL = get_questdb_pool()
ADMIN_SOURCES = {}

# QA_CSV_PATH = Path("/app/benchmark_data/gutenberg_num_questions_5_num_documents_200_qaps.csv")
QA_CSV_PATH = Path("/app/benchmark_data/dataset_wikipedia_qa_5_docs_200.csv")
RESULTS_CSV_PATH = Path("/app/benchmark_data/rag_evaluation_results.csv")
QUERY_TIMING_CSV_PATH = Path("/app/benchmark_data/query_timings.csv")
BATCH_TIMING_CSV_PATH = Path("/app/benchmark_data/batch_timings.csv")
SUMMARY_CSV_PATH = Path("/app/benchmark_data/rag_evaluation_summary.csv")

EVAL_LLM = llm_factory("gpt-4o-mini", client=client)
EVAL_EMBEDDINGS = embedding_factory("openai", model="text-embedding-3-small", client=client)

METRICS = {
    "context_precision": ContextPrecision(llm=EVAL_LLM),
    "context_recall": ContextRecall(llm=EVAL_LLM),
    "answer_relevancy": AnswerRelevancy(
        llm=EVAL_LLM,
        embeddings=EVAL_EMBEDDINGS,
        strictness=3,
    ),
    "faithfulness": Faithfulness(llm=EVAL_LLM),
}

MAX_RETRIES = 50
BATCH_SIZE = 4
RAG_EXECUTOR = ThreadPoolExecutor(max_workers=BATCH_SIZE)
METRIC_EXECUTOR = ThreadPoolExecutor(max_workers=BATCH_SIZE * 4)


def get_vectordb_search_output_in_latest_turn(messages: list[Any]) -> Any | None:
    last_human_index = next(
        (
            i
            for i in range(len(messages) - 1, -1, -1)
            if isinstance(messages[i], HumanMessage)
        ),
        -1,
    )

    if last_human_index == -1:
        return None

    for i in range(last_human_index + 1, len(messages)):
        message = messages[i]

        if not isinstance(message, AIMessage):
            continue

        for tool_call in message.tool_calls or []:
            if tool_call.get("name") != "vectordb_search":
                continue

            call_id = tool_call.get("id")

            for followup in messages[i + 1:]:
                if isinstance(followup, ToolMessage) and followup.tool_call_id == call_id:
                    try:
                        return json.loads(followup.content)
                    except:
                        return None

    return None


def call_rag(query: str, thread_id: str):
    config: dict[str, Any] = {
        "configurable": {
            "thread_id": thread_id,
            "llm": LLM,
            "llm_with_tools": LLM_WITH_TOOLS,
            "vectorstore": VDB,
            "reranker": RERANKER,
            "questdb_pool": QUESTDB_POOL,
            "sources": ADMIN_SOURCES,
        }
    }

    result = GRAPH.invoke(
        {"messages": [HumanMessage(content=query)]}, config
    )

    messages = result.get("messages") or []
    answer = str(messages[-1].content)
    search_results = get_vectordb_search_output_in_latest_turn(messages)

    return answer, search_results


def eval_dataset(query, relevant_docs, answer, reference_answer, eval_id):
    print(f"[BENCHMARK][eval_id={eval_id}] Evaluating all metrics in parallel...")

    def run_metric(args):
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
        ("context_precision", METRICS["context_precision"].score, {"user_input": query, "retrieved_contexts": relevant_docs, "reference": reference_answer}),
        ("context_recall", METRICS["context_recall"].score, {"user_input": query, "retrieved_contexts": relevant_docs, "reference": reference_answer}),
        ("answer_relevancy", METRICS["answer_relevancy"].score, {"user_input": query, "response": answer}),
        ("faithfulness", METRICS["faithfulness"].score, {"user_input": query, "response": answer, "retrieved_contexts": relevant_docs}),
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


def metric_value_or_none(result):
    if isinstance(result, Exception):
        return None
    return result.value


def append_result_row(output_path: Path, evaluation_id: int, results: dict[str, Any] | None, answer: str):
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
                "answer"
            ])

        if results is None:
            writer.writerow([evaluation_id, 0.0, 0.0, 0.0, 0.0, 0, answer])
        else:
            writer.writerow([
                evaluation_id,
                metric_value_or_none(results.get("context_precision")),
                metric_value_or_none(results.get("context_recall")),
                metric_value_or_none(results.get("answer_relevancy")),
                metric_value_or_none(results.get("faithfulness")),
                1,
                answer
            ])

        f.flush()

    print(f"[BENCHMARK][eval_id={evaluation_id}] Saved results to CSV.")


def append_query_timing(evaluation_id: int, batch_id: int, start: float, query_timing_path: Path):
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
    df = pd.read_csv(path)
    df = df.sort_values(column_name, ascending=True)
    df.to_csv(path, index=False)
    print(f"[BENCHMARK] Sorted {path.name} by {column_name}.")


def process_row(row, run_attempt):
    attempt = 0
    results = None
    answer = ""
    chunks = None
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

                answer, search_results = call_rag(query, thread_id=f"benchmark-{run_attempt}-{eval_id}-{attempt}")

                print(f"[BENCHMARK][eval_id={eval_id}] Generated Answer:\t {answer}")

                if search_results is None:
                    print(f"\n[BENCHMARK][eval_id={eval_id}] No search results found for query={query} on document={doc_id}. Skipping {eval_id}.")
                    break

                chunks = search_results.get("chunks", [])

                if not chunks:
                    print(f"\n[BENCHMARK][eval_id={eval_id}] No chunks found for query={query} on document={doc_id}. Skipping {eval_id}.")
                    break

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
                print(f"[BENCHMARK][eval_id={eval_id}] Retrying in {backoff:.0f}s... (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(backoff)

    return eval_id, results, answer, start


def benchmark_rag(run_attempt: int, results_path: Path, query_timing_path: Path, batch_timing_path: Path):
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
                eval_id, results, answer, start = future.result()
                append_result_row(results_path, eval_id, results, answer)
                append_query_timing(eval_id, batch_id, start, query_timing_path)

            except Exception as e:
                print(f"[BENCHMARK] Fatal error in row: {type(e).__name__}: {e}")

        append_batch_timing(batch_id, len(batch), batch_start, batch_timing_path)
        print(f"[BENCHMARK] Batch {batch_id} complete.")

    sort_csv(results_path, "evaluation_id")
    sort_csv(query_timing_path, "evaluation_id")


def summarize_evaluation(attempt: int, results_path: Path, query_timing_path: Path, batch_timing_path: Path):
    df_results = pd.read_csv(results_path)
    df_query_timings = pd.read_csv(query_timing_path)
    df_batch_timings = pd.read_csv(batch_timing_path)


    metric_cols = ["context_precision", "context_recall", "answer_relevancy", "faithfulness"]
    means_metrics = df_results[metric_cols].mean()
    answered_counts = df_results["answered"].value_counts()

    mean_query_time = df_query_timings["elapsed_seconds"].mean()
    mean_batch_time = df_batch_timings["batch_elapsed_seconds"].mean()

    df_summary = pd.DataFrame([{
        "attempt": attempt,
        "mean_context_precision": means_metrics["context_precision"],
        "mean_context_recall": means_metrics["context_recall"],
        "mean_answer_relevancy": means_metrics["answer_relevancy"],
        "mean_faithfulness": means_metrics["faithfulness"],
        "num_answered_0": answered_counts.get(0, 0),
        "num_answered_1": answered_counts.get(1, 0),
        "mean_query_time_seconds": mean_query_time,
        "mean_batch_time_seconds": mean_batch_time,
    }])

    file_exists = SUMMARY_CSV_PATH.exists()
    df_summary.to_csv(SUMMARY_CSV_PATH, mode="a", header=not file_exists, index=False)
    print(f"[BENCHMARK] Appended evaluation summary for attempt {attempt} to {SUMMARY_CSV_PATH}.")



######### call_rag() batch performance evaluation #########

def load_queries_from_csv(path: Path) -> list[dict[str, Any]]:
    queries = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            queries.append({
                "evaluation_id": int(row["evaluation_id"]),
                "document_id": row["document_id"],
                "question": row["question"],
                "answer1": row["answer1"],
            })
    return queries


def rag_perfomance_evaluation(workers: int, output_csv_path: Path, batch_timing_csv_path: Path):
    queries = load_queries_from_csv(QA_CSV_PATH)

    print(f"[BENCHMARK] Starting RAG performance evaluation with {workers} worker(s) on {len(queries)} queries...")

    def run_row(row: dict[str, Any]):
        query = row["question"]
        thread_id = f'eval-{row["evaluation_id"]}'

        query_start = time.perf_counter()
        answer, _ = call_rag(query, thread_id)
        query_elapsed = time.perf_counter() - query_start
        print(f"[BENCHMARK] Query {row['evaluation_id']} response time: {query_elapsed:.3f}s.")

        return {
            **row,
            "generated_answer": answer,
            "elapsed_seconds": round(query_elapsed, 6),
        }

    start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(run_row, queries))

    elapsed = time.perf_counter() - start
    print(f"[BENCHMARK] Performance evaluation completed in {elapsed:.3f}s.")

    with open(output_csv_path, "w", encoding="utf-8", newline="") as f:
        fieldnames = [
            "evaluation_id",
            "document_id",
            "question",
            "answer1",
            "generated_answer",
            "elapsed_seconds",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    print(f"[BENCHMARK] Saved detailed results to {output_csv_path}.")

    with open(batch_timing_csv_path, "w", encoding="utf-8", newline="") as f:
        fieldnames = ["workers", "num_queries", "total_elapsed_seconds", "mean_batch_time_seconds"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerow({
            "workers": workers,
            "num_queries": len(queries),
            "total_elapsed_seconds": round(elapsed, 6),
            "mean_batch_time_seconds": round(elapsed / math.ceil(len(queries) / workers), 6),
        })

    print(f"[BENCHMARK] Saved batch timings to {batch_timing_csv_path}.")


def call_rag_perfomance_evaluation():
    for i in range(8, 9):
        for j in range(1, 2):
            output_csv_path = Path(f"/app/benchmark_data/time_eval_rag_evaluation_results_workers_{i}_attempt_{j}.csv")
            batch_timing_csv_path = Path(f"/app/benchmark_data/time_eval_batch_timings_workers_{i}_attempt_{j}.csv")

            print(f"\n[BENCHMARK] Running attempt {j} of performance evaluation with {i} worker(s)...")
            rag_perfomance_evaluation(workers=i, output_csv_path=output_csv_path, batch_timing_csv_path=batch_timing_csv_path)
            print(f"[BENCHMARK] Completed attempt {j} of performance evaluation with {i} worker(s).")


def run_evaluation(attempt: int):
    suffix = f"_attempt_{attempt}"
    results_path = RESULTS_CSV_PATH.with_stem(f"{RESULTS_CSV_PATH.stem}{suffix}")
    query_timing_path = QUERY_TIMING_CSV_PATH.with_stem(f"{QUERY_TIMING_CSV_PATH.stem}{suffix}")
    batch_timing_path = BATCH_TIMING_CSV_PATH.with_stem(f"{BATCH_TIMING_CSV_PATH.stem}{suffix}")

    benchmark_rag(attempt, results_path, query_timing_path, batch_timing_path)
    summarize_evaluation(attempt, results_path, query_timing_path, batch_timing_path)


def main():
    NUM_EVALUATIONS = 3

    for attempt in range(1, NUM_EVALUATIONS + 1):
        print(f"\n[BENCHMARK] ===== RAG evaluation run {attempt}/{NUM_EVALUATIONS} =====")
        run_evaluation(attempt)


if __name__ == "__main__":
    main()

