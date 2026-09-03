"""JSON and manifest I/O kept separate from detector calculations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from onset_poc.models import (
    DatasetManifest,
    DetectedStroke,
    GroundTruthDocument,
    load_detected_strokes,
)


def read_json(path: Path) -> object:
    return cast(object, json.loads(path.read_text(encoding="utf-8")))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def load_truth(path: Path) -> GroundTruthDocument:
    value = read_json(path)
    if not isinstance(value, dict):
        raise ValueError("Ground truth JSON must be an object")
    return GroundTruthDocument.from_json(cast(dict[str, Any], value))


def load_detection_file(path: Path, sample_rate: int) -> list[DetectedStroke]:
    value = read_json(path)
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError("Detected strokes JSON must be an array of objects")
    return load_detected_strokes(cast(list[dict[str, Any]], value), sample_rate)


def load_dataset(path: Path) -> DatasetManifest:
    value = read_json(path)
    if not isinstance(value, dict):
        raise ValueError("Dataset manifest must be an object")
    return DatasetManifest.from_json(cast(dict[str, Any], value))
