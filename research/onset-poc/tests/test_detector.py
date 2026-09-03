from __future__ import annotations

import numpy as np

from onset_poc import OnsetDetectorConfig, detect_onsets
from tests.helpers import transient_waveform


def test_silence_produces_no_strokes() -> None:
    result = detect_onsets(np.zeros(16_000), 16_000, OnsetDetectorConfig())

    assert result.strokes == ()
    assert len(result.diagnostics.candidate_samples) == 0


def test_detects_and_refines_transient_attacks() -> None:
    expected = [0.25, 0.55, 0.85]
    result = detect_onsets(transient_waveform(expected), 16_000, OnsetDetectorConfig())

    assert len(result.strokes) == 3
    for stroke, time_sec in zip(result.strokes, expected, strict=True):
        assert abs(stroke.time_sec - time_sec) <= 0.004
    assert all(
        refined <= candidate
        for refined, candidate in zip(
            result.diagnostics.refined_samples,
            result.diagnostics.candidate_samples,
            strict=True,
        )
    )


def test_strengths_have_session_relative_db_after_three_reliable_strokes() -> None:
    result = detect_onsets(
        transient_waveform([0.2, 0.5, 0.8], amplitudes=[0.15, 0.3, 0.6]),
        16_000,
        OnsetDetectorConfig(),
    )

    relative = [stroke.relative_attack_db for stroke in result.strokes]
    assert all(value is not None for value in relative)
    assert relative[0] is not None and relative[2] is not None
    assert relative[0] < 0 < relative[2]


def test_close_double_is_not_collapsed_by_refractory() -> None:
    result = detect_onsets(
        transient_waveform([0.3, 0.335], amplitudes=[0.45, 0.4]),
        16_000,
        OnsetDetectorConfig(),
    )

    assert len(result.strokes) == 2
    assert result.strokes[1].sample_index - result.strokes[0].sample_index >= 400


def test_near_clipping_threshold_is_reported_as_a_flag() -> None:
    result = detect_onsets(
        transient_waveform([0.5], amplitudes=[1.2]),
        16_000,
        OnsetDetectorConfig(),
    )

    assert len(result.strokes) == 1
    assert "near-clipping" in result.strokes[0].flags
