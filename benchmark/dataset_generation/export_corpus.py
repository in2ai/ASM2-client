from pathlib import Path
import shutil
import pandas as pd

BASE_DIR_DATA_GEN = "benchmark/dataset_generation"
BASE_DIR_BENCH_DATA = "benchmark/data"

# Corpus folder of each source, keyed by the value of the dataset's `source` column.
CORPUS_DIRS = {
    "squad2.0": f"{BASE_DIR_DATA_GEN}/squad2.0/corpus",
    "narrativeqa": f"{BASE_DIR_DATA_GEN}/narrativeqa/corpus",
}


def export_corpus(dataset_csv_path: str, output_dir: str, corpus_dirs: dict[str, str]) -> int:
    """Collect the corpus files the dataset actually asks about into one folder."""
    
    print(f"\nExporting corpus files referenced by {dataset_csv_path}")

    df = pd.read_csv(dataset_csv_path)

    unknown_sources = set(df["source"].unique()) - set(corpus_dirs)
    if unknown_sources:
        raise ValueError(
            f"No corpus folder configured for source(s): {sorted(unknown_sources)}. "
            f"Configured: {sorted(corpus_dirs)}."
        )

    output_path = Path(output_dir)

    # Drop a previous export so removed documents do not linger in the upload folder.
    if output_path.exists():
        shutil.rmtree(output_path)

    total_copied = 0

    for source, corpus_dir in corpus_dirs.items():
        document_ids = df.loc[df["source"] == source, "document_id"].astype(str).unique()

        if not len(document_ids):
            print(f" - {source}: not present in the dataset, skipped.")
            continue

        corpus_path = Path(corpus_dir)
        source_output_path = output_path / source
        source_output_path.mkdir(parents=True, exist_ok=True)

        for document_id in document_ids:
            source_file = corpus_path / f"{document_id}.txt"

            if not source_file.is_file():
                raise FileNotFoundError(
                    f"Document '{document_id}' of source '{source}' is in the dataset "
                    f"but missing from the corpus: {source_file}. "
                    f"Re-run the generation script of {source}."
                )

            shutil.copy2(source_file, source_output_path / source_file.name)
            total_copied += 1

        num_available = len(list(corpus_path.glob("*.txt")))
        print(
            f" - {source}: copied {len(document_ids)} of {num_available} corpus file(s) "
            f"to {source_output_path}"
        )

    print(f"Exported {total_copied} corpus file(s) to {output_path}.")

    return total_copied


def main():
    dataset_csv_path = f"{BASE_DIR_BENCH_DATA}/dataset_asm2.csv"
    output_dir = f"{BASE_DIR_BENCH_DATA}/corpus_to_upload"
    export_corpus(dataset_csv_path, output_dir, CORPUS_DIRS)


if __name__ == "__main__":
    main()
