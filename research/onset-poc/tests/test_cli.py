from __future__ import annotations

import csv
import json
from pathlib import Path

from onset_poc.cli import main

ROOT = Path(__file__).resolve().parents[3]
AUDIO_DIRECTORY = ROOT / "fixtures" / "audio"
WAV = AUDIO_DIRECTORY / "phase4-synthetic.wav"
TRUTH = AUDIO_DIRECTORY / "phase4-synthetic-truth.json"
DATASET = AUDIO_DIRECTORY / "phase4-synthetic-dataset.json"
CONFIG_DIRECTORY = ROOT / "research" / "onset-poc" / "configs"


def test_detect_evaluate_and_visualize_commands(tmp_path: Path) -> None:
    detected = tmp_path / "detected.json"
    metrics = tmp_path / "metrics.json"
    plot = tmp_path / "diagnostic.png"

    assert main(["detect", str(WAV), "--output", str(detected)]) == 0
    assert main(["evaluate", str(detected), str(TRUTH), "--output", str(metrics)]) == 0
    assert (
        main(
            [
                "visualize",
                str(WAV),
                str(TRUTH),
                "--output",
                str(plot),
                "--metrics-output",
                str(tmp_path / "visual-metrics.json"),
            ]
        )
        == 0
    )

    detected_value = json.loads(detected.read_text(encoding="utf-8"))
    metrics_value = json.loads(metrics.read_text(encoding="utf-8"))
    assert isinstance(detected_value, list)
    assert metrics_value["counts"] == {
        "truth": 7,
        "detected": 7,
        "matched": 7,
        "miss": 0,
        "extra": 0,
    }
    assert metrics_value["f1"] == 1
    assert plot.stat().st_size > 10_000


def test_sweep_command_writes_overall_and_stratified_rows(tmp_path: Path) -> None:
    comparison = tmp_path / "comparison.csv"
    report = tmp_path / "report.md"

    assert (
        main(
            [
                "sweep",
                str(DATASET),
                str(CONFIG_DIRECTORY / "synthetic-grid.json"),
                "--output",
                str(comparison),
                "--report",
                str(report),
            ]
        )
        == 0
    )

    with comparison.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    scopes = {row["scope"] for row in rows}
    assert len([row for row in rows if row["scope"] == "overall"]) == 6
    assert "instrument=synthetic-practice-pad" in scopes
    assert "tempoBpm=120.0" in scopes
    report_text = report.read_text(encoding="utf-8")
    assert "real-recording" in report_text and "gates" in report_text
