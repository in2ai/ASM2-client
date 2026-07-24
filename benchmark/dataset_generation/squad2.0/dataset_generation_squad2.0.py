import csv
import json
import os
import sys
import random
import re
from pathlib import Path

BASE_DIR = "benchmark/dataset_generation/squad2.0"

def indent_json(input_file, output_file=None):
    """
    Reads an unindented JSON file and writes it back with indentation.

    Args:
        input_file: Path to the input JSON file.
        output_file: Path to the output file (optional). If not provided,
                    the result is printed to stdout.
    """

    print(f"\nIndenting JSON file: {input_file}")

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            json_content = f.read()

        json_data = json.loads(json_content)

        indented_json = json.dumps(json_data, indent=4, ensure_ascii=False)

        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(indented_json)
            print(f"Indented JSON written to: {output_file}")
        else:
            print(indented_json)

    except json.JSONDecodeError as e:
        print(f"Error: The file is not valid JSON. {e}")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"Error: File not found. {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)



def generate_txt(json_input, output_folder):
    """Generate one .txt file per title from a SQuAD-style JSON file.

    For each title in the dataset, iterate over its paragraphs, collect all the
    distinct contexts and write them into a text file named after the title
    (e.g. "Normans.txt").

    Args:
        json_input: Path to the input JSON file.
        output_folder: Folder where the .txt files will be saved. It is created
            if it does not already exist.
    """
    print(f"\nGenerating .txt files from {json_input} into {output_folder}")
    
    os.makedirs(output_folder, exist_ok=True)

    with open(json_input, "r", encoding="utf-8") as f:
        data = json.load(f)

    json_modified = False

    for article in data["data"]:
        title = article["title"]

        # Sanitize the title so it can be used as a valid file name.
        safe_title = re.sub(r'[\\/*?:"<>|]', "_", title)

        # If the title had to be sanitized, update it in the JSON so the title and the .txt file name always stay in correspondence.
        if safe_title != title:
            article["title"] = safe_title
            json_modified = True
            print(f"Sanitized title '{title}' to '{safe_title}' for file name.")

        # Collect the different contexts for this title.
        contexts = [paragraph["context"] for paragraph in article["paragraphs"]]

        output_path = os.path.join(output_folder, f"{safe_title}.txt")

        with open(output_path, "w", encoding="utf-8") as out_file:
            out_file.write("\n\n".join(contexts))

        print(f"Saved {len(contexts)} contexts to {output_path}")

    if json_modified:
        with open(json_input, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        # print(f"Updated sanitized titles written back to {json_input}")
    
    print("Finished generating .txt files for all titles.")

def generate_dataset(
    json_input,
    csv_output,
    max_questions_per_document=5,
    max_documents=200,
    seed=42
):
    """Build a sampled CSV directly from a SQuAD-style JSON file.

    Documents (articles) are taken in the order they appear in the JSON, up to
    ``max_documents``. For each document, up to ``max_questions_per_document``
    answerable questions are chosen at random (with a fixed ``seed`` for
    reproducibility).

    Only answerable questions are considered (is_impossible == False).

    The CSV has the following columns:
        - evaluation_id: sequential numeric id, renumbered from 1.
        - source: the data source, always "squad2.0". Lets datasets from
          different origins be merged and traced back.
        - document_id: the title of the article (matches the .txt file name),
          e.g. "Beyoncé", "Frédéric_Chopin".
        - question: the question text. One question per row.
        - answer1: the answer text. If a question has more than one possible
          answer, the first one is used.

    Args:
        json_input: Path to the input JSON file.
        csv_output: Path to the CSV file to create.
        max_questions_per_document: Maximum number of questions per document.
        max_documents: Maximum number of documents to include.
        seed: Random seed for reproducibility.
    """

    print("\nGenerating QA dataset...")

    rng = random.Random(seed)

    with open(json_input, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Take the first ``max_documents`` articles in order.
    selected_articles = data["data"][:max_documents]

    evaluation_id = 1

    with open(csv_output, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["evaluation_id", "source", "document_id", "question", "answer1"])

        for article in selected_articles:
            document_id = article["title"]

            # Collect all answerable questions for this document.
            qa_pairs = []
            for paragraph in article["paragraphs"]:
                for qa in paragraph["qas"]:
                    # Keep only answerable questions.
                    if qa["is_impossible"]:
                        continue

                    question = qa["question"]
                    # Use the first available answer.
                    answer = qa["answers"][0]["text"]
                    qa_pairs.append((question, answer))

            # Randomly sample up to ``max_questions_per_document`` questions.
            sample_size = min(max_questions_per_document, len(qa_pairs))
            sampled_pairs = rng.sample(qa_pairs, sample_size)

            for question, answer in sampled_pairs:
                writer.writerow([evaluation_id, "squad2.0", document_id, question, answer])
                evaluation_id += 1

    print(
        f"QA dataset generated: wrote {evaluation_id - 1} questions from "
        f"{len(selected_articles)} documents to {csv_output}"
    )

def delete_auxiliary_files(file_paths):
    """
    Deletes intermediate/auxiliary files produced by the pipeline (e.g.
    asm2-squad-train-v2.0-indented.json). Missing files are skipped silently.

    Args:
        file_paths (Iterable[str]): Paths of the files to delete.

    Returns:
        int: Number of files actually deleted.
    """
    print("\nDeleting auxiliary files...")

    deleted = 0
    for file_path in file_paths:
        file = Path(file_path)
        if file.is_file():
            file.unlink()
            deleted += 1
            print(f" - Deleted {file}")

    print(f"Deleted {deleted} auxiliary file(s).")

    return deleted


def main():
    # JSON indentation
    dataset_json_path = f"{BASE_DIR}/asm2-squad-train-v2.0.json"
    dataset_indented_json_path = f"{BASE_DIR}/asm2-squad-train-v2.0-indented.json"
    indent_json(dataset_json_path, dataset_indented_json_path)

    # Generate .txt files for each document in the dataset
    corpus_folder = f"{BASE_DIR}/corpus"
    generate_txt(dataset_indented_json_path, corpus_folder)

    # Dataset generation
    max_questions_per_document = 5
    max_documents = 200
    dataset_csv_path = f"{BASE_DIR}/dataset_squad2.0_qa_{max_questions_per_document}_docs_{max_documents}.csv"
    generate_dataset(
        json_input=dataset_indented_json_path,
        csv_output=dataset_csv_path,
        max_questions_per_document=max_questions_per_document,
        max_documents=max_documents,
        seed=42
    )

    # Clean up intermediate files that are no longer needed
    delete_auxiliary_files([dataset_indented_json_path])

    print("\nDataset generation completed.")


if __name__ == "__main__":
    main()