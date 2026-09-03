from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest

from onset_poc.audio import load_wav
from onset_poc.config import load_config
from onset_poc.detector import detect_onsets
from onset_poc.models import load_detected_strokes

ROOT = Path(__file__).resolve().parents[3]


def test_shared_wav_matches_detected_stroke_golden() -> None:
    audio = load_wav(ROOT / "fixtures/audio/phase4-synthetic.wav")
    config = load_config(ROOT / "research/onset-poc/configs/practice-pad-baseline.json")
    result = detect_onsets(audio.samples, audio.sample_rate, config)
    raw_expected = json.loads(
        (ROOT / "fixtures/performances/phase4-synthetic-detected.json").read_text(encoding="utf-8")
    )
    expected = load_detected_strokes(cast(list[dict[str, Any]], raw_expected), audio.sample_rate)

    assert [stroke.id for stroke in result.strokes] == [stroke.id for stroke in expected]
    assert [stroke.sample_index for stroke in result.strokes] == pytest.approx(
        [stroke.sample_index for stroke in expected], abs=1
    )
    assert [stroke.attack_strength_dbfs for stroke in result.strokes] == pytest.approx(
        [stroke.attack_strength_dbfs for stroke in expected], abs=1e-6
    )
    assert [stroke.stroke_energy_dbfs for stroke in result.strokes] == pytest.approx(
        [stroke.stroke_energy_dbfs for stroke in expected], abs=1e-6
    )
