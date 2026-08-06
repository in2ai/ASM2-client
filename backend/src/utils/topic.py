from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import random
import json
import logging
import os
import time
import uuid
import hashlib
import math
from datetime import timedelta
from typing import Any, Iterable, Mapping

import igraph as ig
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_community.vectorstores import Qdrant
from langchain_core.documents import Document
from qdrant_client.http import models

from src.config.env import get_bool_env, get_float_env, get_int_env
from src.config.config import APPROX_SEARCH_PARAMS
from src.connectors.qdrant_ops import run_qdrant_write_with_retry
from src.utils.nlp import SUPPORTED_LANGUAGES

# ===========================================================================
# Tunable parameters
# ===========================================================================

CALCULATE_TOPICS = get_bool_env("CALCULATE_TOPICS")
VECTOR_NAME = "embedding"
TOPIC_MAPPING_FILENAME = "topics.json"
TOPIC_PAYLOAD_BATCH_SIZE = 256

# Representative selection. REP_MAX is the knob that actually binds for
# documents of a few hundred chunks; REP_RATIO only matters for short ones.
REP_RATIO = 0.15
REP_MIN = 4
REP_MAX = 48                 # per block, not per document
CENTROID_SAMPLE = 128
MMR_DIVERSITY = 0.5          # Qdrant convention: 0.0 relevance, 1.0 diversity

# Documents vary enormously in size, so anything bigger than one block is handled
# a block at a time. That keeps MMR in the range where it behaves well, keeps the
# has_id filter under the gRPC message limit, and keeps candidates_limit under the
# server ceiling, which is a hard 16384.
MMR_CANDIDATE_LIMIT = 16384
REP_BLOCK = 16384
REP_DOC_MAX = 2048           # ceiling on representatives for a single document
BLEND_SLICE = 2048           # chunks held in memory at once in blend_and_write

# Similarity graph.
KNN_LIMIT = 50
MIN_COSINE = 0.3
KNN_CHUNK_SIZE = 64

# Clustering. The graph is weighted by cosine similarity and built over
# representatives only, so its density is well below that of the old unweighted
# chunk graph and the old TOPIC_RESOLUTION of 0.025 does not carry over. This is
# an estimate; find_communities logs density and size percentiles so the first
# real run can replace it with a measured value.
TOPIC_OBJECTIVE = "CPM"      # or "modularity"
TOPIC_MIN_CONTRIB = get_float_env("TOPIC_MIN_CONTRIB", 0.3)
TOPIC_RESOLUTION_WEIGHTED = get_float_env("TOPIC_RESOLUTION", 0.0125)
TOPIC_LEIDEN_ITERS = -1      # -1 iterates to convergence
MIN_COMMUNITY_DOCS = get_int_env("MIN_COMMUNITY_DOCS", 2)
MIN_COMMUNITY_SIZE = get_int_env("MIN_COMMUNITY_SIZE", 300)
MIN_COMMUNITY_REPS = 10      # need enough members to sample for naming
MAX_TOPICS = get_int_env("MAX_TOPICS", 300)
TOPIC_SAMPLE_COUNT = 20

# Assignment.
SELF_WEIGHT = 1.0            # own community against neighbours when smoothing
BLEND_TAU = 0.05             # softmax temperature, reps -> chunks
WEIGHT_QUANTUM = 0.01        # rounding, which keeps payloads groupable

# Refuse to write if clustering clearly went wrong.
MIN_TOPICS_TO_WRITE = 5
MIN_COVERAGE_TO_WRITE = 0.05

# Execution.
LLM_MAX_WORKERS = 8
QDRANT_BATCH_WRITE = 1000
SCROLL_BATCH = 1024
RETRIEVE_BATCH = 256
EDGE_CHUNK = 4_000_000
QDRANT_TIMEOUT = 600
PROGRESS_STEP = 5            # log progress every N percent


class Progress:
    """Percentage and ETA logging. tqdm does not render under Docker."""

    def __init__(self, label, total):
        self.label = label
        self.total = max(int(total or 0), 0)
        self.count = 0
        self.started = time.monotonic()
        self.milestone = PROGRESS_STEP

    def step(self, count=1):
        self.count += count
        if not self.total:
            return
        pct = self.count * 100 // self.total
        if pct < self.milestone:
            return
        elapsed = time.monotonic() - self.started
        rate = self.count / elapsed if elapsed > 0 else 0.0
        eta = timedelta(seconds=int((self.total - self.count) / rate)) if rate else timedelta(0)
        logging.info("%s %d%% (%d/%d) ETA %s", self.label, pct, self.count, self.total, eta)
        self.milestone = pct - pct % PROGRESS_STEP + PROGRESS_STEP

    def finish(self):
        took = timedelta(seconds=int(time.monotonic() - self.started))
        logging.info("%s done: %d in %s", self.label, self.count, took)


class DocumentIndex:
    """Chunk ids grouped by document, held as packed bytes.

    Ten million UUIDs as Python strings would cost several gigabytes. Packed to
    sixteen bytes each they cost 160 MB, and only one document's worth is turned
    back into strings at a time.
    """

    def __init__(self, packed, kind, doc_hashes):
        self.kind = kind
        self.width = 16 if kind == "uuid" else 8
        self.ids = np.frombuffer(packed, dtype=np.uint8).reshape(-1, self.width)

        self.order = np.argsort(doc_hashes, kind="stable")
        grouped = doc_hashes[self.order]
        cuts = np.flatnonzero(grouped[1:] != grouped[:-1]) + 1
        self.starts = np.concatenate(([0], cuts)).astype(np.int64)
        self.ends = np.concatenate((cuts, [grouped.size])).astype(np.int64)

    def __len__(self):
        return int(self.starts.size)

    @property
    def total_chunks(self):
        return int(self.ids.shape[0])

    def chunk_count(self, doc):
        return int(self.ends[doc] - self.starts[doc])

    def chunk_ids(self, doc, start=0, stop=None):
        """Ids for one document, or for a slice of it. Slicing matters because a
        single document can hold hundreds of thousands of chunks, and turning all
        of those back into strings at once would undo the point of packing them."""
        begin = int(self.starts[doc]) + int(start)
        finish = int(self.ends[doc]) if stop is None else int(self.starts[doc]) + int(stop)
        finish = min(finish, int(self.ends[doc]))
        rows = self.ids[self.order[begin:finish]]
        if self.kind == "uuid":
            return [str(uuid.UUID(bytes=row.tobytes())) for row in rows]
        return [int.from_bytes(row.tobytes(), "little") for row in rows]
 
# ===========================================================================
# Helper functions
# ===========================================================================

def get_doc_by_id(vdb, id):
    """As before, except the metadata default is now {} rather than ""."""
    points = vdb.client.retrieve(
        collection_name=vdb.collection_name,
        ids=[id],
        with_payload=True,
    )
    if not points:
        return None

    payload = points[0].payload or {}

    return Document(
        page_content=payload.get("page_content", ""),
        metadata=payload.get("metadata", {}) or {},
    )


def get_docs_by_ids(vdb, ids, fields=("page_content",)):
    """Batched form of get_doc_by_id: one round trip instead of len(ids)."""
    if not ids:
        return []

    points = vdb.client.retrieve(
        collection_name=vdb.collection_name,
        ids=list(ids),
        with_payload=list(fields) if fields else True,
        with_vectors=False,
    )

    docs = []
    for point in points:
        payload = point.payload or {}
        docs.append(Document(
            page_content=payload.get("page_content", ""),
            metadata=payload.get("metadata", {}) or {},
        ))
    return docs


def query_batch_with_retry(client, collection_name, requests, chunk_size=KNN_CHUNK_SIZE,
                           timeout=QDRANT_TIMEOUT, max_retries=3):
    all_hits = []
    for i in range(0, len(requests), chunk_size):
        chunk = requests[i:i + chunk_size]
        for attempt in range(max_retries):
            try:
                all_hits.extend(
                    client.query_batch_points(collection_name, chunk, timeout=timeout)
                )
                break
            except Exception as e:
                # A 4xx will never succeed on retry, so do not spend the backoff on it.
                status = getattr(e, "status_code", None)
                retryable = True
                if status is not None:
                    try:
                        retryable = not (400 <= int(status) < 500)
                    except (TypeError, ValueError):
                        retryable = True

                logging.warning("chunk at %d failed (attempt %d/%d): %s",
                                i, attempt + 1, max_retries, e)
                if not retryable or attempt == max_retries - 1:
                    raise
                time.sleep(2 ** attempt)
    return all_hits


def get_topic(llm, texts):
    system = """
    Eres un asistente que dados una serie de fragmentos de textos tiene que decidir un tema general para los mismos en un contexto de empresa.
    Los textos pueden estar en múltiples idiomas. Devuelve el nombre del tema en español, inglés y gallego, y debe hacer alusión al contenido, no a la forma.
    la respuesta debe ser únicamente un JSON válido con la siguiente forma:

    {
        "Tema": {
            "es": "Tema de los textos (Ejemplos: Recursos Humanos, Contabilidad, Ingeniería de Software, ...)",
            "en": "Topic of the texts (Examples: Human Resources, Accounting, Software Engineering, ...)",
            "gl": "Tema dos textos (Exemplos: Recursos Humanos, Contabilidade, Enxeñaría de Software, ...)"
        },
        "Razonamiento": "Razonamiento corto de por qué se ha elegido ese tema en particular"
    }

    Deber ser claro, directo y razonar adecuadamente. El JSON de tu respuesta no debe estar rodeado de comillas (`) ni markdown, debe ser el JSON en bruto listo para parsear.
    Evita temas compuestos separados por nexos ("Comunicaciones Unificadas y Telefonía IP" son dos temas, no uno).
    """

    user = '\n\n-----------------------\n\n'.join(texts)

    res = None
    tries = 0

    while res is None and tries < 5:
        try:
            tries += 1
            ans = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)]).content
            res = json.loads(ans)

        except json.JSONDecodeError:
            pass

        except Exception:
            break

    return res

# ===========================================================================
# Step 1: validate the collection
# ===========================================================================

def check_collection(vdb):
    info = vdb.client.get_collection(vdb.collection_name)

    try:
        config = info.config.params.vectors
        params = config.get(VECTOR_NAME) if isinstance(config, dict) else config
        distance = getattr(params, "distance", None)
        if distance is not None and distance != models.Distance.COSINE:
            raise RuntimeError(
                "topic extraction needs Distance.COSINE on vector %r but found %r; "
                "MIN_COSINE=%.2f would mean nothing otherwise"
                % (VECTOR_NAME, distance, MIN_COSINE)
            )
    except AttributeError:
        logging.warning("could not read the distance metric, assuming COSINE")

    if "metadata.topic_rep" not in (getattr(info, "payload_schema", None) or {}):
        raise RuntimeError(
            "no payload index on 'metadata.topic_rep'. Without it the representative "
            "filter degrades to a full scan on every KNN query. Create it with:\n"
            "    client.create_payload_index(collection_name=%r, "
            "field_name='metadata.topic_rep', "
            "field_schema=models.PayloadSchemaType.KEYWORD, wait=True)"
            % (vdb.collection_name,)
        )

    total = vdb.client.count(collection_name=vdb.collection_name, exact=True).count
    logging.info("Collection %r holds %d points", vdb.collection_name, total)
    return total

# ===========================================================================
# Step 2: group chunks by document
# ===========================================================================

def build_document_index(vdb, total_points):
    """One payload-only scroll. Never builds a dict of per-document id lists."""
    progress = Progress("Indexing chunks", total_points)

    id_blocks = []
    hash_blocks = []
    kind = None
    offset = None
    seen = 0

    while True:
        batch, offset = vdb.client.scroll(
            collection_name=vdb.collection_name,
            offset=offset,
            limit=SCROLL_BATCH,
            with_payload=["metadata.id", "metadata.source"],
            with_vectors=False,
            timeout=QDRANT_TIMEOUT,
        )
        if not batch:
            break

        if kind is None:
            kind = "int" if isinstance(batch[0].id, int) else "uuid"
            logging.info("Point ids look like: %s", kind)

        if kind == "uuid":
            id_blocks.append(b"".join(uuid.UUID(str(p.id)).bytes for p in batch))
        else:
            id_blocks.append(b"".join(int(p.id).to_bytes(8, "little") for p in batch))

        hashes = np.empty(len(batch), dtype=np.uint64)
        for i, point in enumerate(batch):
            meta = (point.payload or {}).get("metadata") or {}
            # A 64-bit hash of (id, source). At ten million documents the odds of a
            # collision are about three in a million, and a collision would merge
            # two documents rather than corrupt anything.
            digest = hashlib.blake2b(
                ("%s\x00%s" % (meta.get("id"), meta.get("source"))).encode("utf-8"),
                digest_size=8,
            ).digest()
            hashes[i] = int.from_bytes(digest, "big", signed=False)
        hash_blocks.append(hashes)

        seen += len(batch)
        progress.step(len(batch))

        if offset is None:
            break

    progress.finish()
    if not seen:
        return None

    index = DocumentIndex(b"".join(id_blocks), kind, np.concatenate(hash_blocks))

    sizes = (index.ends - index.starts).astype(np.float64)
    percentiles = np.percentile(sizes, [50, 90, 99])
    logging.info("Indexed %d chunks across %d documents | mean %.0f | p50/p90/p99 %.0f/%.0f/%.0f | max %.0f",
                 index.total_chunks, len(index), sizes.mean(),
                 percentiles[0], percentiles[1], percentiles[2], sizes.max())

    oversized = int(np.sum(sizes > REP_BLOCK))
    if oversized:
        logging.info("%d document(s) exceed %d chunks and will be processed in blocks; "
                     "the largest holds %.0f (%.1f%% of the collection)",
                     oversized, REP_BLOCK, sizes.max(),
                     100.0 * sizes.max() / max(index.total_chunks, 1))
    return index

# ===========================================================================
# Step 3: pick representatives, document by document
# ===========================================================================

def select_representatives(vdb, index):
    """Estimate a centroid from a sample, then let Qdrant run MMR over the
    candidates. Only the chosen ids come back over the wire.

    Documents larger than REP_BLOCK are split into blocks and each block gets its
    own centroid and its own MMR call, so a document holding a third of a million
    chunks costs the same per block as an ordinary one and still ends up with
    representatives spread across the whole of it.
    """
    blocks = []
    for doc in range(len(index)):
        n_chunks = index.chunk_count(doc)
        count = max(1, (n_chunks + REP_BLOCK - 1) // REP_BLOCK)
        # Share the per-document ceiling out across the blocks.
        allowance = max(1, REP_DOC_MAX // count)
        for start_at in range(0, max(n_chunks, 1), REP_BLOCK):
            blocks.append((doc, start_at, min(start_at + REP_BLOCK, n_chunks), allowance))

    progress = Progress("Selecting representatives", index.total_chunks)

    rep_ids = []
    rep_doc = []
    rep_weight = []
    doc_reps = [[] for _ in range(len(index))]

    for doc, start_at, stop_at, allowance in blocks:
        chunk_ids = index.chunk_ids(doc, start_at, stop_at)
        size = len(chunk_ids)
        if not size:
            continue

        wanted = min(max(int(math.ceil(REP_RATIO * size)), REP_MIN), REP_MAX, allowance, size)

        if size <= wanted:
            reps = list(chunk_ids)
        else:
            sample = vdb.client.retrieve(
                collection_name=vdb.collection_name,
                ids=random.sample(chunk_ids, min(CENTROID_SAMPLE, size)),
                with_payload=False,
                with_vectors=[VECTOR_NAME],
            )
            vectors = []
            for point in sample:
                vector = point.vector
                vector = vector.get(VECTOR_NAME) if isinstance(vector, dict) else vector
                if vector is not None:
                    vectors.append(vector)

            centroid = np.asarray(vectors, dtype=np.float32).mean(axis=0) if vectors else None
            norm = float(np.linalg.norm(centroid)) if centroid is not None else 0.0

            if norm <= 1e-12:
                logging.warning("no usable centroid for document %d, sampling at random", doc)
                reps = random.sample(chunk_ids, wanted)
            else:
                found = vdb.client.query_points(
                    collection_name=vdb.collection_name,
                    query=models.NearestQuery(
                        nearest=(centroid / norm).tolist(),
                        mmr=models.Mmr(
                            diversity=MMR_DIVERSITY,
                            # The server rejects anything above 16384.
                            candidates_limit=min(size, MMR_CANDIDATE_LIMIT),
                        ),
                    ),
                    using=VECTOR_NAME,
                    query_filter=models.Filter(
                        must=[models.HasIdCondition(has_id=chunk_ids)]
                    ),
                    limit=wanted,
                    with_payload=False,
                    with_vectors=False,
                    timeout=QDRANT_TIMEOUT,
                )
                reps = [point.id for point in found.points]
                if not reps:
                    logging.warning("MMR returned nothing for document %d, sampling at random", doc)
                    reps = random.sample(chunk_ids, wanted)

        # Each rep speaks for this many chunks, which is how community size gets
        # measured in chunks rather than in reps later on.
        weight = size / float(len(reps))
        first = len(rep_ids)
        for rep_id in reps:
            rep_ids.append(rep_id)
            rep_doc.append(doc)
            rep_weight.append(weight)
        doc_reps[doc].extend(range(first, len(rep_ids)))

        del chunk_ids
        progress.step(size)

    progress.finish()
    logging.info("Chose %d representatives from %d blocks, %.1f%% of all chunks",
                 len(rep_ids), len(blocks),
                 100.0 * len(rep_ids) / max(index.total_chunks, 1))

    return (rep_ids,
            np.asarray(rep_doc, dtype=np.int64),
            np.asarray(rep_weight, dtype=np.float64),
            doc_reps)

# ===========================================================================
# Step 4: tag the representatives
# ===========================================================================

def mark_representatives(vdb, rep_ids, run_token):
    progress = Progress("Marking representatives", len(rep_ids))
    for i in range(0, len(rep_ids), QDRANT_BATCH_WRITE):
        batch = rep_ids[i:i + QDRANT_BATCH_WRITE]
        vdb.client.set_payload(
            collection_name=vdb.collection_name,
            key="metadata",
            payload={"topic_rep": run_token},
            points=batch,
            wait=False,
        )
        progress.step(len(batch))
    progress.finish()

    # wait=False returns before the tags are visible to a filtered search.
    marker = models.Filter(must=[models.FieldCondition(
        key="metadata.topic_rep",
        match=models.MatchValue(value=run_token),
    )])
    for _ in range(60):
        visible = vdb.client.count(
            collection_name=vdb.collection_name,
            count_filter=marker,
            exact=True,
        ).count
        if visible >= len(rep_ids):
            return
        time.sleep(2)
    logging.warning("representative tags did not fully settle, carrying on")


# ===========================================================================
# Step 5: similarity graph over representatives only
# ===========================================================================

def build_similarity_graph(vdb, rep_ids, run_token):
    n_reps = len(rep_ids)
    position = {rep_id: i for i, rep_id in enumerate(rep_ids)}
    marker = models.Filter(must=[models.FieldCondition(
        key="metadata.topic_rep",
        match=models.MatchValue(value=run_token),
    )])

    progress = Progress("Similarity graph", n_reps)
    left_blocks, right_blocks, weight_blocks = [], [], []
    outside = 0

    for i in range(0, n_reps, KNN_CHUNK_SIZE):
        batch = rep_ids[i:i + KNN_CHUNK_SIZE]
        requests = [
            models.QueryRequest(
                query=rep_id,                  # by point id, so no vector upload
                using=VECTOR_NAME,
                limit=KNN_LIMIT,
                filter=marker,
                score_threshold=MIN_COSINE,
                with_payload=False,
                with_vector=False,
                params=APPROX_SEARCH_PARAMS,
            )
            for rep_id in batch
        ]
        hits = query_batch_with_retry(
            vdb.client, vdb.collection_name, requests,
            chunk_size=KNN_CHUNK_SIZE, timeout=QDRANT_TIMEOUT,
        )

        left, right, weight = [], [], []
        for rep_id, result in zip(batch, hits):
            here = position[rep_id]
            for point in result.points:
                if point.id == rep_id or point.score < MIN_COSINE:
                    continue
                there = position.get(point.id)
                if there is None:
                    outside += 1       # used to be an unguarded KeyError
                    continue
                if there == here:
                    continue
                left.append(here)
                right.append(there)
                weight.append(point.score)

        if left:
            left_blocks.append(np.asarray(left, dtype=np.int32))
            right_blocks.append(np.asarray(right, dtype=np.int32))
            weight_blocks.append(np.asarray(weight, dtype=np.float32))
        progress.step(len(batch))

    progress.finish()
    if outside:
        logging.warning("ignored %d neighbours that were not representatives", outside)

    if not left_blocks:
        logging.warning("the similarity graph came out empty")
        blank = np.zeros(0, dtype=np.int32)
        return ig.Graph(n=n_reps, directed=False), blank, blank, np.zeros(0, dtype=np.float32)

    source = np.concatenate(left_blocks)
    target = np.concatenate(right_blocks)
    weights = np.concatenate(weight_blocks)
    del left_blocks, right_blocks, weight_blocks

    # Orient every edge the same way, then collapse duplicates keeping the larger
    # weight. Each edge is discovered from both ends, so this roughly halves the
    # count, and it replaces the old set of Python tuples that held 50N objects.
    low = np.minimum(source, target).astype(np.int64)
    high = np.maximum(source, target).astype(np.int64)
    del source, target

    key = low * np.int64(n_reps) + high
    ordering = np.argsort(key, kind="stable")
    key = key[ordering]
    weights = weights[ordering]
    firsts = np.flatnonzero(np.concatenate(([True], key[1:] != key[:-1])))
    best = np.maximum.reduceat(weights, firsts)
    key = key[firsts]
    low = (key // n_reps).astype(np.int32)
    high = (key % n_reps).astype(np.int32)
    del key, weights, ordering, firsts

    n_edges = int(low.size)
    logging.info("Graph: %d vertices, %d edges, mean weight %.3f, mean degree %.1f, density %.2e",
                 n_reps, n_edges, float(best.mean()), 2.0 * n_edges / max(n_reps, 1),
                 (2.0 * n_edges) / max(n_reps * (n_reps - 1), 1))

    graph = ig.Graph(n=n_reps, directed=False)
    for i in range(0, n_edges, EDGE_CHUNK):
        graph.add_edges(list(zip(low[i:i + EDGE_CHUNK].tolist(),
                                 high[i:i + EDGE_CHUNK].tolist())))
    graph.es["weight"] = best.tolist()

    return graph, low, high, best

# ===========================================================================
# Step 6: cluster, then discard outlier communities
# ===========================================================================

def find_communities(graph, rep_doc, rep_weight, n_docs):
    logging.info("Clustering with Leiden (%s, resolution %.4f)",
                 TOPIC_OBJECTIVE, TOPIC_RESOLUTION_WEIGHTED)

    options = dict(
        objective_function=TOPIC_OBJECTIVE,
        resolution=TOPIC_RESOLUTION_WEIGHTED,
        n_iterations=TOPIC_LEIDEN_ITERS,
    )
    if graph.ecount():
        options["weights"] = "weight"

    membership = np.asarray(graph.community_leiden(**options).membership, dtype=np.int64)
    n_communities = int(membership.max()) + 1 if membership.size else 0
    if not n_communities:
        return [], membership, None

    reps_per = np.bincount(membership, minlength=n_communities)

    chunks_per = np.zeros(n_communities, dtype=np.float64)
    np.add.at(chunks_per, membership, rep_weight)

    stride = np.int64(n_docs + 1)
    docs_per = np.bincount(
        (np.unique(membership * stride + rep_doc) // stride).astype(np.int64),
        minlength=n_communities,
    )

    def spread(values):
        return np.percentile(values, [50, 95]).tolist() + [float(values.max())]

    logging.info(
        "%d communities | reps p50/p95/max %.0f/%.0f/%.0f | chunks %.0f/%.0f/%.0f | docs %.0f/%.0f/%.0f",
        n_communities,
        *(spread(reps_per.astype(np.float64)) + spread(chunks_per) + spread(docs_per.astype(np.float64)))
    )

    big_enough = chunks_per >= MIN_COMMUNITY_SIZE
    wide_enough = docs_per >= MIN_COMMUNITY_DOCS
    dense_enough = reps_per >= MIN_COMMUNITY_REPS
    keep = np.flatnonzero(big_enough & wide_enough & dense_enough)

    logging.info(
        "Filters dropped %d by document spread (<%d), %d by size (<%d chunks), "
        "%d by rep count (<%d); %d remain",
        int(np.sum(~wide_enough)), MIN_COMMUNITY_DOCS,
        int(np.sum(wide_enough & ~big_enough)), MIN_COMMUNITY_SIZE,
        int(np.sum(wide_enough & big_enough & ~dense_enough)), MIN_COMMUNITY_REPS,
        keep.size,
    )

    keep = keep[np.argsort(-chunks_per[keep], kind="stable")]
    if keep.size > MAX_TOPICS:
        logging.info("Trimming %d communities to MAX_TOPICS=%d, smallest kept covers ~%.0f chunks",
                     keep.size, MAX_TOPICS, chunks_per[keep[MAX_TOPICS - 1]])
        keep = keep[:MAX_TOPICS]

    return keep.tolist(), membership, chunks_per

# ===========================================================================
# Step 7: name each surviving community
# ===========================================================================

def name_topics(llm, vdb, graph, rep_ids, communities, membership):
    """One LLM call per community, run in parallel. Topic numbering stays
    deterministic regardless of the order results come back in."""
    n_communities = int(membership.max()) + 1 if membership.size else 0
    by_community = np.argsort(membership, kind="stable")
    bounds = np.concatenate(([0], np.cumsum(np.bincount(membership, minlength=n_communities))))

    def describe(slot_and_community):
        slot, community = slot_and_community
        try:
            members = by_community[bounds[community]:bounds[community + 1]]
            # The most strongly connected members sit nearest the middle of the
            # community, so they name it better than a random sample would.
            if members.size > 1 and graph.ecount():
                strength = np.asarray(
                    graph.induced_subgraph(members.tolist()).strength(weights="weight"),
                    dtype=np.float64,
                )
                picks = members[np.argsort(-strength, kind="stable")[:TOPIC_SAMPLE_COUNT]]
            else:
                picks = members[:TOPIC_SAMPLE_COUNT]

            docs = get_docs_by_ids(vdb, [rep_ids[int(i)] for i in picks])
            texts = [doc.page_content for doc in docs if doc.page_content]
            if not texts:
                return slot, None
            return slot, get_topic(llm, texts)
        except Exception as e:
            logging.warning("could not name community %d: %s", community, e)
            return slot, None

    progress = Progress("Naming topics", len(communities))
    answers = [None] * len(communities)
    with ThreadPoolExecutor(max_workers=LLM_MAX_WORKERS) as workers:
        for slot, answer in workers.map(describe, list(enumerate(communities))):
            answers[slot] = answer
            progress.step()
    progress.finish()

    topic_mapping = {lang: {} for lang in SUPPORTED_LANGUAGES}
    topic_of_community = {}
    topic_index = 0

    for slot, community in enumerate(communities):
        answer = answers[slot]
        if answer is None:
            continue

        names = answer.get("Tema")
        if isinstance(names, str):
            names = {lang: names for lang in SUPPORTED_LANGUAGES}
        if not isinstance(names, dict):
            continue

        # Same fallback chain as the original: asked-for language, then Spanish,
        # then any non-empty value, then a placeholder.
        for lang in SUPPORTED_LANGUAGES:
            name = names.get(lang) or names.get("es")
            if not name:
                name = next((v for v in names.values() if isinstance(v, str) and v.strip()), None)
            topic_mapping[lang][str(topic_index)] = name or f"Topic {topic_index}"

        topic_of_community[int(community)] = topic_index
        topic_index += 1

    logging.info("Named %d topics, %d calls came back empty",
                 topic_index, len(communities) - topic_index)
    return topic_mapping, topic_of_community, topic_index

# ===========================================================================
# Step 8: spread topics across the representative graph
# ===========================================================================

def smooth_topics(n_reps, low, high, weights, topic_of_rep, n_topics):
    """Every rep keeps its own community and picks up its neighbours' in
    proportion to similarity. Neighbours in other communities count, which is the
    cross-community blending the old code only managed by accident, and it fixes
    the old habit of ignoring a vertex's own community entirely."""
    spread = csr_matrix((n_reps, n_topics), dtype=np.float32)

    for i in range(0, low.size, EDGE_CHUNK):
        here = low[i:i + EDGE_CHUNK].astype(np.int64)
        there = high[i:i + EDGE_CHUNK].astype(np.int64)
        weight = weights[i:i + EDGE_CHUNK]
        topic_here = topic_of_rep[here]
        topic_there = topic_of_rep[there]

        forward = topic_there >= 0
        backward = topic_here >= 0
        rows = np.concatenate([here[forward], there[backward]])
        cols = np.concatenate([topic_there[forward], topic_here[backward]])
        vals = np.concatenate([weight[forward], weight[backward]])
        if rows.size:
            spread = spread + coo_matrix((vals, (rows, cols)),
                                         shape=(n_reps, n_topics)).tocsr()

    owned = np.flatnonzero(topic_of_rep >= 0)
    if owned.size:
        spread = spread + coo_matrix(
            (np.full(owned.size, SELF_WEIGHT, dtype=np.float32),
             (owned, topic_of_rep[owned])),
            shape=(n_reps, n_topics),
        ).tocsr()

    totals = np.asarray(spread.sum(axis=1)).ravel()
    totals[totals <= 0] = 1.0
    spread = csr_matrix(spread.multiply((1.0 / totals)[:, None]))
    spread.eliminate_zeros()

    carrying = int(np.sum(np.diff(spread.indptr) > 0))
    logging.info("Smoothing left %d of %d representatives carrying a topic (%.0f%%)",
                 carrying, n_reps, 100.0 * carrying / max(n_reps, 1))
    return spread

# ===========================================================================
# Step 9: blend down to every chunk and write
# ===========================================================================

def blend_and_write(vdb, index, doc_reps, rep_ids, rep_topics):
    """Weights are continuous, so payloads would all be unique without the
    rounding; with it they group, and identical payloads share one operation.

    Chunks are streamed in fixed-size slices rather than a document at a time, so
    peak memory depends on BLEND_SLICE and not on how large a document is. Only
    the representative vectors are held for the duration, and there are at most
    REP_DOC_MAX of those.
    """
    progress = Progress("Writing topics", index.total_chunks)

    buckets = defaultdict(list)
    contents = {}
    queued = 0
    requests = 0
    use_batch = True
    written = 0
    with_topics = 0

    def flush():
        nonlocal queued, requests, use_batch
        if not queued:
            return
        groups = [(contents[key], ids) for key, ids in buckets.items()]
        buckets.clear()
        contents.clear()
        queued = 0

        if use_batch:
            operations = [
                models.SetPayloadOperation(set_payload=models.SetPayload(
                    payload={"topics": topics},
                    key="metadata",
                    points=ids[i:i + QDRANT_BATCH_WRITE],
                ))
                for topics, ids in groups
                for i in range(0, len(ids), QDRANT_BATCH_WRITE)
            ]
            try:
                vdb.client.batch_update_points(
                    collection_name=vdb.collection_name,
                    update_operations=operations,
                    wait=False,
                )
                requests += 1
                return
            except Exception as e:
                logging.warning("batch_update_points is unavailable (%s), "
                                "falling back to set_payload", e)
                use_batch = False

        for topics, ids in groups:
            for i in range(0, len(ids), QDRANT_BATCH_WRITE):
                vdb.client.set_payload(
                    collection_name=vdb.collection_name,
                    key="metadata",
                    payload={"topics": topics},
                    points=ids[i:i + QDRANT_BATCH_WRITE],
                    wait=False,
                )
                requests += 1

    def queue(point_id, topics):
        nonlocal queued
        key = json.dumps(topics, sort_keys=True)
        contents.setdefault(key, topics)
        buckets[key].append(point_id)
        queued += 1
        if queued >= QDRANT_BATCH_WRITE:
            flush()

    def fetch_vectors(ids):
        found = {}
        for i in range(0, len(ids), RETRIEVE_BATCH):
            for point in vdb.client.retrieve(
                collection_name=vdb.collection_name,
                ids=ids[i:i + RETRIEVE_BATCH],
                with_payload=False,
                with_vectors=[VECTOR_NAME],
            ):
                vector = point.vector
                vector = vector.get(VECTOR_NAME) if isinstance(vector, dict) else vector
                if vector is not None:
                    found[point.id] = vector
        return found

    for doc in range(len(index)):
        n_chunks = index.chunk_count(doc)
        reps = doc_reps[doc] or []

        anchor_vectors = fetch_vectors([rep_ids[rep] for rep in reps]) if reps else {}
        columns = [rep for rep in reps if rep_ids[rep] in anchor_vectors]

        anchors = None
        if columns:
            anchors = np.asarray([anchor_vectors[rep_ids[rep]] for rep in columns],
                                 dtype=np.float32)
            norms = np.linalg.norm(anchors, axis=1, keepdims=True)
            np.maximum(norms, 1e-12, out=norms)
            anchors /= norms
            anchor_topics = rep_topics[columns].toarray()
        del anchor_vectors

        for start_at in range(0, max(n_chunks, 1), BLEND_SLICE):
            slice_ids = index.chunk_ids(doc, start_at, min(start_at + BLEND_SLICE, n_chunks))
            if not slice_ids:
                continue

            if anchors is None:
                for chunk_id in slice_ids:
                    queue(chunk_id, {})
                    written += 1
                progress.step(len(slice_ids))
                continue

            vectors = fetch_vectors(slice_ids)
            for chunk_id in slice_ids:
                if chunk_id not in vectors:
                    queue(chunk_id, {})
                    written += 1

            present = [chunk_id for chunk_id in slice_ids if chunk_id in vectors]
            if present:
                matrix = np.asarray([vectors[chunk_id] for chunk_id in present],
                                    dtype=np.float32)
                norms = np.linalg.norm(matrix, axis=1, keepdims=True)
                np.maximum(norms, 1e-12, out=norms)
                matrix /= norms
                del vectors

                # Similarities inside one document sit in a narrow band, so without
                # the temperature this would flatten into a plain average over the
                # representatives.
                similarity = matrix @ anchors.T
                similarity -= similarity.max(axis=1, keepdims=True)
                similarity /= BLEND_TAU
                np.exp(similarity, out=similarity)
                similarity /= similarity.sum(axis=1, keepdims=True)

                blended = similarity @ anchor_topics
                del similarity, matrix

                rows, topic_columns = np.nonzero(blended >= TOPIC_MIN_CONTRIB)
                per_chunk = defaultdict(dict)
                for row, column in zip(rows.tolist(), topic_columns.tolist()):
                    weight = float(blended[row, column])
                    per_chunk[row][str(column)] = round(
                        round(weight / WEIGHT_QUANTUM) * WEIGHT_QUANTUM, 6
                    )
                del blended

                for i, chunk_id in enumerate(present):
                    topics = per_chunk.get(i, {})
                    queue(chunk_id, topics)
                    written += 1
                    if topics:
                        with_topics += 1

            progress.step(len(slice_ids))

    flush()
    progress.finish()
    logging.info("Wrote %d chunks in %d requests, %d of them (%.0f%%) got a topic",
                 written, requests, with_topics, 100.0 * with_topics / max(written, 1))

# ===========================================================================
# Step 10: take the tags back off
# ===========================================================================

def clear_markers(vdb, rep_ids, run_token):
    """Best effort. Leftovers are inert because the token belongs to this run
    alone, so verify and report rather than assume it worked."""
    if not rep_ids:
        return

    for i in range(0, len(rep_ids), QDRANT_BATCH_WRITE):
        try:
            vdb.client.delete_payload(
                collection_name=vdb.collection_name,
                keys=["metadata.topic_rep"],
                points=rep_ids[i:i + QDRANT_BATCH_WRITE],
                wait=True,
            )
        except Exception as e:
            logging.warning("could not clear tags at %d: %s", i, e)

    try:
        left = vdb.client.count(
            collection_name=vdb.collection_name,
            count_filter=models.Filter(must=[models.FieldCondition(
                key="metadata.topic_rep",
                match=models.MatchValue(value=run_token),
            )]),
            exact=True,
        ).count
    except Exception as e:
        logging.warning("could not verify tag cleanup: %s", e)
        return

    if left:
        logging.warning(
            "%d representative tags remain because the nested delete was ignored. "
            "They are harmless, but to clear them:\n"
            "    client.delete_payload(collection_name=%r, keys=['metadata.topic_rep'], "
            "points=models.Filter(must=[models.FieldCondition("
            "key='metadata.topic_rep', match=models.MatchValue(value=%r))]), wait=True)",
            left, vdb.collection_name, run_token,
        )

# ===========================================================================
# Initial topic extraction
# ===========================================================================

def extract_initial_topics(llm, vdb, vdb_path: str, pool=None):
    if not CALCULATE_TOPICS:
        return

    logging.info("Executing topic extraction...")
    started = time.monotonic()

    total_points = check_collection(vdb)
    if not total_points:
        logging.warning("the collection is empty, nothing to do")
        return

    index = build_document_index(vdb, total_points)
    if index is None:
        logging.warning("nothing came back from the scroll, nothing to do")
        return

    rep_ids, rep_doc, rep_weight, doc_reps = select_representatives(vdb, index)
    if not rep_ids:
        logging.warning("no representatives were chosen, nothing to do")
        return

    run_token = "run-%s" % uuid.uuid4().hex

    try:
        mark_representatives(vdb, rep_ids, run_token)

        graph, low, high, weights = build_similarity_graph(vdb, rep_ids, run_token)

        communities, membership, chunks_per = find_communities(
            graph, rep_doc, rep_weight, len(index)
        )
        if not communities:
            logging.error("no community survived the filters, so nothing was written. "
                          "Check the percentiles above and consider lowering "
                          "MIN_COMMUNITY_SIZE, MIN_COMMUNITY_DOCS or "
                          "TOPIC_RESOLUTION_WEIGHTED.")
            return

        topic_mapping, topic_of_community, n_topics = name_topics(
            llm, vdb, graph, rep_ids, communities, membership
        )
        if n_topics < MIN_TOPICS_TO_WRITE:
            logging.error("only %d topics were named, under MIN_TOPICS_TO_WRITE=%d, "
                          "so nothing was written", n_topics, MIN_TOPICS_TO_WRITE)
            return

        coverage = sum(chunks_per[c] for c in topic_of_community) / max(total_points, 1)
        logging.info("Topics should cover about %.0f%% of chunks", 100.0 * coverage)
        if coverage < MIN_COVERAGE_TO_WRITE:
            logging.error("expected coverage %.3f is under MIN_COVERAGE_TO_WRITE=%.3f, "
                          "so nothing was written", coverage, MIN_COVERAGE_TO_WRITE)
            return

        topic_of_rep = np.full(len(rep_ids), -1, dtype=np.int64)
        for community, topic in topic_of_community.items():
            topic_of_rep[membership == community] = topic

        rep_topics = smooth_topics(len(rep_ids), low, high, weights, topic_of_rep, n_topics)

        blend_and_write(vdb, index, doc_reps, rep_ids, rep_topics)

        save_topic_mapping(vdb_path, topic_mapping, pool)

    finally:
        clear_markers(vdb, rep_ids, run_token)

    logging.info("Finished topic extraction in %s",
                 timedelta(seconds=int(time.monotonic() - started)))

# ===========================================================================
# Mapping management
# ===========================================================================

def get_topic_mapping_path(vdb_path: str) -> str:
    return os.path.join(vdb_path, TOPIC_MAPPING_FILENAME)


def load_topic_mapping(vdb_path: str) -> dict:
    path = get_topic_mapping_path(vdb_path)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_topic_mapping(vdb_path: str, mapping: dict, pool=None) -> None:
    os.makedirs(vdb_path, exist_ok=True)
    path = get_topic_mapping_path(vdb_path)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    if pool is not None:
        from src.metrics.metrics import register_topic_intl

        register_topic_intl(pool, mapping)


def resolve_topic_names(
    topic_indices: Iterable[int], lang_code: str, vdb_path: str
) -> dict[str, str]:
    mapping = load_topic_mapping(vdb_path)

    if not mapping:
        return {str(idx): str(idx) for idx in topic_indices}

    lang_map = mapping.get(lang_code) or mapping.get("es") or {}
    fallback_map = mapping.get("es", {})
    resolved = {}

    for idx in topic_indices:
        key = str(idx)
        name = None

        if isinstance(lang_map, dict):
            name = lang_map.get(key)

        if not name and isinstance(fallback_map, dict):
            name = fallback_map.get(key)

        resolved[key] = name if name else str(idx)

    return resolved

# ===========================================================================
# Incremental assignment, for chunks added after the initial estimation
# ===========================================================================

ASSIGN_KNN_LIMIT = 200
MIN_TOPIC_NEIGHBOURS = 20
ASSIGN_MIN_CONTRIB = None    # None reuses TOPIC_MIN_CONTRIB

# Averaging neighbours is inherently softer than the initial pass's softmax blend,
# so incremental weights come out lower for the same confidence. Measured on a
# synthetic collection: initial mean top weight 0.88, incremental 0.61, a ratio of
# 0.69. Setting a temperature here sharpens the averaged distribution the same way
# blend_and_write does, which brought the ratio to 0.93 with no change in accuracy.
# Left off by default because it rescales weights rather than correcting them.
ASSIGN_SHARPEN_TAU = None    # e.g. 0.15


def set_topic_payloads(vdb, topic_payloads, batch_size=None):
    """Persist per-point topic payloads in bounded, retryable Qdrant batches.

    Points that end up with the same topic dict travel as one operation. Most
    incremental batches repeat themselves a lot, and every point that came out
    empty shares the same payload, so this collapses hard.
    """
    effective_batch_size = max(
        1, TOPIC_PAYLOAD_BATCH_SIZE if batch_size is None else batch_size
    )

    grouped = defaultdict(list)
    for point_id, topics in topic_payloads.items():
        key = json.dumps({str(t): w for t, w in topics.items()}, sort_keys=True)
        grouped[key].append(point_id)

    if not grouped:
        return

    # Keep every operation under the batch size, then pack operations into
    # requests that stay under it too.
    pieces = [
        (key, point_ids[i:i + effective_batch_size])
        for key, point_ids in grouped.items()
        for i in range(0, len(point_ids), effective_batch_size)
    ]

    requests = []
    current, carried = [], 0
    for key, point_ids in pieces:
        if current and carried + len(point_ids) > effective_batch_size:
            requests.append(current)
            current, carried = [], 0
        current.append(models.SetPayloadOperation(set_payload=models.SetPayload(
            key="metadata",
            payload={"topics": json.loads(key)},
            points=point_ids,
        )))
        carried += len(point_ids)
    if current:
        requests.append(current)

    logging.info("Updating topic metadata for %d points in %d requests, %d distinct payloads",
                 len(topic_payloads), len(requests), len(grouped))

    for number, operations in enumerate(requests, start=1):
        run_qdrant_write_with_retry(
            # Bound as a default argument so the call cannot pick up a later value.
            lambda ops=operations: vdb.client.batch_update_points(
                collection_name=vdb.collection_name,
                update_operations=ops,
                wait=True,
            ),
            operation_name=f"update topic payload batch {number}/{len(requests)}",
        )


def assign_topics(vdb, ids):
    """Borrow topics for freshly added chunks from the neighbours around them.

    Needs extract_initial_topics to have run first: this only ever assigns from
    the catalogue that produced, and never invents a new topic.
    """
    if not CALCULATE_TOPICS:
        return

    ids = list(ids)
    if not ids:
        return

    threshold = TOPIC_MIN_CONTRIB if ASSIGN_MIN_CONTRIB is None else ASSIGN_MIN_CONTRIB

    requests = [
        models.QueryRequest(
            query=point_id,
            using=VECTOR_NAME,
            limit=ASSIGN_KNN_LIMIT,
            score_threshold=MIN_COSINE,         # drop weak hits server side
            with_payload=["metadata.topics"],   # not the page_content
            with_vector=False,
            params=APPROX_SEARCH_PARAMS,
        )
        for point_id in ids
    ]

    progress = Progress("Assigning topics", len(ids))
    topic_payloads = {}
    assigned = below = thin = 0

    for i in range(0, len(ids), KNN_CHUNK_SIZE):
        batch = ids[i:i + KNN_CHUNK_SIZE]
        hits = query_batch_with_retry(
            vdb.client, vdb.collection_name, requests[i:i + KNN_CHUNK_SIZE],
            chunk_size=KNN_CHUNK_SIZE, timeout=QDRANT_TIMEOUT,
        )

        for point_id, nearest in zip(batch, hits):
            neighbours = []
            for point in nearest.points:
                if point.id == point_id or point.score < MIN_COSINE:
                    continue
                topics = ((point.payload or {}).get("metadata") or {}).get("topics")
                # An empty dict means "no topic here", not "here is a topic".
                # Counting those would inflate the divisor below and water every
                # weight down towards the threshold.
                if topics:
                    neighbours.append(topics)

            if len(neighbours) < MIN_TOPIC_NEIGHBOURS:
                # Not enough evidence to say anything. Still write {} so every
                # point carries the key, the way extract_initial_topics leaves it.
                topic_payloads[point_id] = {}
                thin += 1
                continue

            totals = {}
            contrib = 1.0 / len(neighbours)
            for topics in neighbours:
                for topic, weight in topics.items():
                    totals[topic] = totals.get(topic, 0.0) + weight * contrib

            if ASSIGN_SHARPEN_TAU and totals:
                highest = max(totals.values())
                sharpened = {
                    topic: math.exp((weight - highest) / ASSIGN_SHARPEN_TAU)
                    for topic, weight in totals.items()
                }
                scale = sum(sharpened.values())
                totals = {topic: w / scale for topic, w in sharpened.items()}

            keep = {
                str(topic): round(round(weight / WEIGHT_QUANTUM) * WEIGHT_QUANTUM, 6)
                for topic, weight in totals.items()
                if weight >= threshold
            }
            topic_payloads[point_id] = keep
            if keep:
                assigned += 1
            else:
                below += 1

        progress.step(len(batch))

    progress.finish()
    logging.info("Assigned %d chunks, %d landed below %.2f, %d had under %d neighbours with topics",
                 assigned, below, threshold, thin, MIN_TOPIC_NEIGHBOURS)

    without = below + thin
    if without > len(ids) // 2:
        logging.warning("%d of %d chunks (%.0f%%) came out with no topic, which suggests the "
                        "catalogue no longer covers what is being ingested; consider "
                        "re-running extract_initial_topics",
                        without, len(ids), 100.0 * without / len(ids))

    set_topic_payloads(vdb, topic_payloads)
