import pytest

from onset_poc import DetectedStroke, GroundTruthDocument, load_detected_strokes


def test_loads_shared_detected_stroke_contract() -> None:
    values = [
        {
            "id": "det-0",
            "sampleIndex": 480,
            "timeSec": 0.01,
            "attackStrengthDbfs": -18.0,
            "strokeEnergyDbfs": -16.0,
            "relativeAttackDb": None,
            "relativeEnergyDb": None,
            "confidence": 0.9,
            "flags": [],
        }
    ]

    assert load_detected_strokes(values, 48_000) == [
        DetectedStroke(
            id="det-0",
            sample_index=480,
            time_sec=0.01,
            attack_strength_dbfs=-18.0,
            stroke_energy_dbfs=-16.0,
            relative_attack_db=None,
            relative_energy_db=None,
            confidence=0.9,
            flags=(),
        )
    ]


def test_validates_ground_truth_time_and_order() -> None:
    value = {
        "schemaVersion": "1.0",
        "audioPath": "fixture.wav",
        "sampleRate": 1_000,
        "frameCount": 1_000,
        "events": [
            {"id": "later", "sampleIndex": 500, "timeSec": 0.5},
            {"id": "earlier", "sampleIndex": 250, "timeSec": 0.25},
        ],
    }

    with pytest.raises(ValueError, match="ordered"):
        GroundTruthDocument.from_json(value)
