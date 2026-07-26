import json
from pathlib import Path

from app.agents.state import SPECIALISTS

GOLD_DATASET_PATH = Path(__file__).parent.parent / "evals" / "gold_dataset.json"


def _load_gold_dataset() -> list[dict]:
    return json.loads(GOLD_DATASET_PATH.read_text())


def test_gold_dataset_entries_are_well_formed():
    examples = _load_gold_dataset()
    assert examples, "gold dataset must not be empty"

    ids = [ex["id"] for ex in examples]
    assert len(ids) == len(set(ids)), "gold dataset ids must be unique"

    for ex in examples:
        assert ex["question"].strip(), f"{ex['id']}: question must not be empty"
        assert ex["expected_route"], f"{ex['id']}: expected_route must not be empty"
        assert ex["answer_criteria"].strip(), f"{ex['id']}: answer_criteria must not be empty"
        for specialist in ex["expected_route"]:
            assert specialist in SPECIALISTS, f"{ex['id']}: unknown specialist '{specialist}'"


def test_gold_dataset_covers_every_specialist():
    examples = _load_gold_dataset()
    covered = {specialist for ex in examples for specialist in ex["expected_route"]}
    missing = set(SPECIALISTS) - covered
    assert not missing, f"gold dataset has no example routing to: {sorted(missing)}"
