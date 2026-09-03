from __future__ import annotations

import numpy as np
import numpy.typing as npt


def transient_waveform(
    event_times: list[float],
    *,
    sample_rate: int = 16_000,
    duration_sec: float = 1.5,
    amplitudes: list[float] | None = None,
) -> npt.NDArray[np.float64]:
    generator = np.random.default_rng(12345)
    waveform = generator.normal(0, 0.0005, round(sample_rate * duration_sec))
    levels = amplitudes or [0.4] * len(event_times)
    for time_sec, amplitude in zip(event_times, levels, strict=True):
        start = round(time_sec * sample_rate)
        length = min(round(0.07 * sample_rate), len(waveform) - start)
        time = np.arange(length) / sample_rate
        carrier = np.sin(2 * np.pi * 700 * time + 0.4)
        waveform[start : start + length] += amplitude * np.exp(-time / 0.018) * carrier
    return np.asarray(waveform, dtype=np.float64)
