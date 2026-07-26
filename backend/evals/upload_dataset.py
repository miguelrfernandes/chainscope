"""Mirrors gold_dataset.json into a LangSmith dataset, overwriting any existing examples so the
LangSmith copy always matches the file in the repo. Usage: `uv run python -m evals.upload_dataset`."""

import json
from pathlib import Path

from langsmith import Client

from evals._env import ensure_langsmith_env

DATASET_NAME = "chainscope-gold"
DATASET_PATH = Path(__file__).parent / "gold_dataset.json"


def main() -> None:
    ensure_langsmith_env()
    gold_examples = json.loads(DATASET_PATH.read_text())
    client = Client()

    if client.has_dataset(dataset_name=DATASET_NAME):
        dataset = client.read_dataset(dataset_name=DATASET_NAME)
        existing_ids = [ex.id for ex in client.list_examples(dataset_id=dataset.id)]
        if existing_ids:
            client.delete_examples(example_ids=existing_ids)
    else:
        dataset = client.create_dataset(
            dataset_name=DATASET_NAME,
            description="Gold Q&A set for ChainScope specialist routing and answer correctness.",
        )

    client.create_examples(
        dataset_id=dataset.id,
        examples=[
            {
                "inputs": {"question": ex["question"]},
                "outputs": {
                    "expected_route": ex["expected_route"],
                    "answer_criteria": ex["answer_criteria"],
                },
                "metadata": {"id": ex["id"]},
            }
            for ex in gold_examples
        ],
    )
    print(f"Uploaded {len(gold_examples)} examples to LangSmith dataset '{DATASET_NAME}'.")


if __name__ == "__main__":
    main()
