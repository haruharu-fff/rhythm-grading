from __future__ import annotations

from onset_poc import DetectedStroke, GroundTruthDocument, evaluate_detections


def make_stroke(identifier: str, time_sec: float, sample_rate: int = 1_000) -> DetectedStroke:
    return DetectedStroke(
        id=identifier,
        sample_index=round(time_sec * sample_rate),
        time_sec=time_sec,
        attack_strength_dbfs=-18,
        stroke_energy_dbfs=-16,
        relative_attack_db=None,
        relative_energy_db=None,
        confidence=0.9,
        flags=(),
    )


def test_offset_matching_preserves_miss_and_extra() -> None:
    truth = GroundTruthDocument.from_json(
        {
            "schemaVersion": "1.0",
            "audioPath": "test.wav",
            "sampleRate": 1_000,
            "frameCount": 2_000,
            "durationSec": 2,
            "events": [
                {"id": "t0", "sampleIndex": 200, "timeSec": 0.2},
                {"id": "t1", "sampleIndex": 500, "timeSec": 0.5},
                {"id": "t2", "sampleIndex": 800, "timeSec": 0.8},
                {"id": "t3", "sampleIndex": 1_100, "timeSec": 1.1},
            ],
        }
    )
    detected = [
        make_stroke("d0", 0.24),
        make_stroke("extra", 0.39),
        make_stroke("d2", 0.842),
        make_stroke("d3", 1.138),
    ]

    metrics = evaluate_detections(truth, detected, tolerance_ms=20)

    assert [(match.truth_id, match.detected_id) for match in metrics.matches] == [
        ("t0", "d0"),
        ("t2", "d2"),
        ("t3", "d3"),
    ]
    assert metrics.missed_truth_ids == ("t1",)
    assert metrics.extra_detected_ids == ("extra",)
    assert metrics.precision == 0.75
    assert metrics.recall == 0.75
    assert metrics.f1 == 0.75
    assert abs(metrics.estimated_offset_sec - 0.04) < 0.002
    assert metrics.timing_adjusted_mae_sec is not None
    assert metrics.timing_adjusted_mae_sec < 0.002
