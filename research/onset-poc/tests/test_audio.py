from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from onset_poc.audio import load_wav


def test_load_wav_can_mix_or_select_a_channel(tmp_path: Path) -> None:
    path = tmp_path / "stereo.wav"
    channels = np.column_stack(
        [np.full(100, 0.2, dtype=np.float64), np.full(100, -0.1, dtype=np.float64)]
    )
    sf.write(path, channels, 8_000, subtype="FLOAT")

    mixed = load_wav(path)
    selected = load_wav(path, channel=1)

    assert mixed.sample_rate == 8_000
    assert mixed.source_channels == 2
    assert np.allclose(mixed.samples, 0.05)
    assert np.allclose(selected.samples, -0.1)
