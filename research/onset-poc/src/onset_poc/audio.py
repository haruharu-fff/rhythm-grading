"""WAV loading helpers for the research detector."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt
import soundfile as sf  # type: ignore[import-untyped]

FloatArray = npt.NDArray[np.float64]


@dataclass(frozen=True, slots=True)
class AudioData:
    samples: FloatArray
    sample_rate: int
    source_channels: int

    @property
    def duration_sec(self) -> float:
        return len(self.samples) / self.sample_rate


def load_wav(path: Path, channel: int | None = None) -> AudioData:
    raw, sample_rate = sf.read(path, dtype="float64", always_2d=True)
    if raw.shape[0] == 0:
        raise ValueError("WAV contains no audio frames")
    source_channels = int(raw.shape[1])
    if channel is None:
        samples = np.mean(raw, axis=1, dtype=np.float64)
    else:
        if channel < 0 or channel >= source_channels:
            raise ValueError(f"Channel {channel} is outside 0..{source_channels - 1}")
        samples = raw[:, channel]
    if not np.all(np.isfinite(samples)):
        raise ValueError("WAV contains non-finite samples")
    return AudioData(
        samples=np.asarray(samples, dtype=np.float64),
        sample_rate=int(sample_rate),
        source_channels=source_channels,
    )
