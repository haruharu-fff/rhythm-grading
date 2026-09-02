"""Dataset parameter sweeps with aggregate and stratified metrics."""

from __future__ import annotations

import csv
import itertools
import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from statistics import fmean
from typing import cast

import numpy as np

from onset_poc.audio import load_wav
from onset_poc.config import OnsetDetectorConfig
from onset_poc.detector import detect_onsets
from onset_poc.evaluation import DetectionMetrics, evaluate_detections
from onset_poc.models import DatasetItem
from onset_poc.serialization import load_dataset, load_truth, read_json


@dataclass(frozen=True, slots=True)
class SweepObservation:
    item: DatasetItem
    metrics: DetectionMetrics


def _grid_combinations(path: Path) -> list[dict[str, object]]:
    value = read_json(path)
    if not isinstance(value, dict) or value.get("schemaVersion") != "1.0":
        raise ValueError("Config grid must use schemaVersion 1.0")
    parameters = value.get("parameters")
    if not isinstance(parameters, dict) or not parameters:
        raise ValueError("Config grid parameters must be a non-empty object")
    keys = sorted(parameters)
    choices: list[list[object]] = []
    for key in keys:
        values = parameters[key]
        if not isinstance(values, list) or not values:
            raise ValueError(f"Grid parameter {key} must be a non-empty array")
        choices.append(cast(list[object], values))
    return [dict(zip(keys, values, strict=True)) for values in itertools.product(*choices)]


def _aggregate(observations: Iterable[SweepObservation]) -> dict[str, float | int | None]:
    values = list(observations)
    truth_count = sum(item.metrics.truth_count for item in values)
    detected_count = sum(item.metrics.detected_count for item in values)
    matched_count = sum(item.metrics.matched_count for item in values)
    extra_count = sum(item.metrics.extra_count for item in values)
    duration = sum(item.metrics.duration_sec for item in values)
    adjusted_errors = [
        match.offset_adjusted_error_sec for item in values for match in item.metrics.matches
    ]
    precision = matched_count / detected_count if detected_count else None
    recall = matched_count / truth_count if truth_count else None
    f1 = (
        None
        if precision is None or recall is None or precision + recall == 0
        else 2 * precision * recall / (precision + recall)
    )
    return {
        "items": len(values),
        "truth": truth_count,
        "detected": detected_count,
        "matched": matched_count,
        "miss": truth_count - matched_count,
        "extra": extra_count,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "falsePositivesPerMinute": extra_count * 60 / duration if duration else 0.0,
        "timingAdjustedMaeMs": (
            fmean(abs(error) for error in adjusted_errors) * 1000 if adjusted_errors else None
        ),
        "timingAdjustedP95Ms": (
            float(np.percentile(np.abs(adjusted_errors), 95)) * 1000 if adjusted_errors else None
        ),
    }


def _scopes(observations: list[SweepObservation]) -> dict[str, list[SweepObservation]]:
    scopes: dict[str, list[SweepObservation]] = {"overall": observations}
    grouped: defaultdict[str, list[SweepObservation]] = defaultdict(list)
    for observation in observations:
        for key, value in sorted(observation.item.labels.items()):
            grouped[f"{key}={value}"].append(observation)
    scopes.update(grouped)
    return scopes


def run_sweep(
    dataset_path: Path,
    grid_path: Path,
    output_csv: Path,
    *,
    base_config: OnsetDetectorConfig,
    tolerance_ms: float,
    maximum_offset_ms: float,
) -> list[dict[str, object]]:
    manifest = load_dataset(dataset_path)
    combinations = _grid_combinations(grid_path)
    rows: list[dict[str, object]] = []
    for config_index, overrides in enumerate(combinations):
        config = base_config.with_overrides(overrides)
        observations: list[SweepObservation] = []
        for item in manifest.items:
            wav_path = (dataset_path.parent / item.wav_path).resolve()
            truth_path = (dataset_path.parent / item.truth_path).resolve()
            audio = load_wav(wav_path)
            truth = load_truth(truth_path)
            if truth.sample_rate != audio.sample_rate or truth.frame_count != len(audio.samples):
                raise ValueError(f"Audio metadata does not match truth for dataset item {item.id}")
            detection = detect_onsets(audio.samples, audio.sample_rate, config)
            metrics = evaluate_detections(
                truth,
                detection.strokes,
                tolerance_ms=tolerance_ms,
                maximum_offset_ms=maximum_offset_ms,
            )
            observations.append(SweepObservation(item=item, metrics=metrics))
        for scope, scoped in _scopes(observations).items():
            rows.append(
                {
                    "configIndex": config_index,
                    "scope": scope,
                    "detectorVersion": config.version,
                    "presetName": config.preset_name,
                    "parameters": json.dumps(overrides, sort_keys=True, separators=(",", ":")),
                    **_aggregate(scoped),
                }
            )
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        raise ValueError("Sweep produced no rows")
    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return rows


def _format_metric(row: dict[str, object], key: str, digits: int = 3) -> str:
    value = row[key]
    return "—" if value is None else f"{float(cast(float, value)):.{digits}f}"


def write_experiment_report(path: Path, rows: list[dict[str, object]]) -> None:
    overall = [row for row in rows if row["scope"] == "overall"]
    ranked = sorted(
        overall,
        key=lambda row: (
            -(float(cast(float, row["f1"])) if row["f1"] is not None else -1),
            float(cast(float, row["timingAdjustedMaeMs"]))
            if row["timingAdjustedMaeMs"] is not None
            else float("inf"),
        ),
    )
    lines = [
        "# Onset detector sweep report",
        "",
        "This report is generated from the supplied dataset manifest. Synthetic fixtures are a",
        "software regression baseline, not evidence that the detector meets the real-recording",
        "gates.",
        "",
        "| Rank | Config | F1 | Precision | Recall | Adjusted MAE | P95 |",
        "|---:|---|---:|---:|---:|---:|---:|",
    ]
    for rank, row in enumerate(ranked, start=1):
        lines.append(
            f"| {rank} | `{row['parameters']}` | {_format_metric(row, 'f1')} | "
            f"{_format_metric(row, 'precision')} | {_format_metric(row, 'recall')} | "
            f"{_format_metric(row, 'timingAdjustedMaeMs', 2)} ms | "
            f"{_format_metric(row, 'timingAdjustedP95Ms', 2)} ms |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "Review the stratified CSV rows and diagnostic waveform plots before selecting a",
            "preset.",
            "Do not promote these parameters to a product default until practice-pad and snare",
            "recordings cover strength, tempo, pattern, microphone distance, and orientation axes.",
            "",
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
