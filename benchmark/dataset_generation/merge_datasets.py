import pandas as pd

BASE_DIR_DATA_GEN = "benchmark/dataset_generation"
BASE_DIR_BENCH_DATA = "benchmark/data"

def merge_datasets(first_csv_path: str, second_csv_path: str, output_csv_path: str) -> None:
    """Merge two CSV files with the same columns into a new one.

    Args:
        first_csv_path: Path to the CSV placed on top. Its `evaluation_id` is
            assumed to start at 1, be sorted and have no gaps.
        second_csv_path: Path to the CSV placed below. Its `evaluation_id` is
            shifted to continue the numbering of the first one.
        output_csv_path: Path of the resulting CSV.
    """
    first = pd.read_csv(first_csv_path)
    second = pd.read_csv(second_csv_path)

    if list(first.columns) != list(second.columns):
        raise ValueError(
            f"Columns do not match:\n  {list(first.columns)}\n  {list(second.columns)}"
        )

    # N = evaluation_id of the last question in the first dataset.
    n = int(first["evaluation_id"].iloc[-1])

    # Row i (starting at 1) of the second dataset becomes N + i.
    second["evaluation_id"] = second["evaluation_id"] + n

    combined = pd.concat([first, second], ignore_index=True)
    combined.to_csv(output_csv_path, index=False)

    print(f"Generated {output_csv_path} with {len(pd.read_csv(output_csv_path))} rows.")


def main():
    first_csv_path = f"{BASE_DIR_DATA_GEN}/squad2.0/dataset_squad2.0_qa_5_docs_200.csv"
    second_csv_path = f"{BASE_DIR_DATA_GEN}/narrativeqa/dataset_narrativeqa_qa_5_docs_200.csv"
    output_csv_path = f"{BASE_DIR_BENCH_DATA}/dataset_asm2.csv"
    merge_datasets(first_csv_path, second_csv_path, output_csv_path)


if __name__ == "__main__":
    main()
    
