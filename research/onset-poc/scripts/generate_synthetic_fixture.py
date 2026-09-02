"""Generate the small deterministic WAV used by Phase 4 CLI examples."""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIRECTORY = ROOT / "fixtures" / "audio"
SAMPLE_RATE = 16_000
DURATION_SEC = 2.4
EVENTS = [
    (0.25, 0.20, "weak"),
    (0.55, 0.36, "medium"),
    (0.85, 0.55, "strong"),
    (0.885, 0.43, "medium"),
    (1.30, 0.30, "medium"),
    (1.65, 0.48, "strong"),
    (2.00, 0.34, "medium"),
]


def make_waveform() -> np.ndarray:
    frame_count = round(SAMPLE_RATE * DURATION_SEC)
    generator = np.random.default_rng(20260902)
    samples = generator.normal(0, 0.0008, frame_count)
    for time_sec, amplitude, _ in EVENTS:
        start = round(time_sec * SAMPLE_RATE)
        length = min(round(0.09 * SAMPLE_RATE), frame_count - start)
        time = np.arange(length) / SAMPLE_RATE
        carrier = 0.72 * np.sin(2 * np.pi * 620 * time + 0.35)
        carrier += 0.28 * np.sin(2 * np.pi * 1_430 * time + 0.8)
        transient = amplitude * np.exp(-time / 0.021) * carrier
        samples[start : start + length] += transient
    return np.clip(samples, -0.98, 0.98)


def main() -> None:
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    waveform = make_waveform()
    wav_path = OUTPUT_DIRECTORY / "phase4-synthetic.wav"
    pcm = np.round(waveform * 32767).astype("<i2")
    with wave.open(str(wav_path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())
    events = [
        {
            "id": f"truth-{index:02d}",
            "sampleIndex": round(time_sec * SAMPLE_RATE),
            "timeSec": round(time_sec, 6),
            "labels": {"strength": strength},
        }
        for index, (time_sec, _, strength) in enumerate(EVENTS)
    ]
    truth = {
        "schemaVersion": "1.0",
        "audioPath": wav_path.name,
        "sampleRate": SAMPLE_RATE,
        "frameCount": len(waveform),
        "durationSec": DURATION_SEC,
        "labels": {
            "instrument": "synthetic-practice-pad",
            "tempoBpm": 120,
            "pattern": "single-and-close-double",
        },
        "events": events,
    }
    (OUTPUT_DIRECTORY / "phase4-synthetic-truth.json").write_text(
        json.dumps(truth, indent=2) + "\n", encoding="utf-8"
    )
    dataset = {
        "schemaVersion": "1.0",
        "items": [
            {
                "id": "phase4-synthetic",
                "wavPath": wav_path.name,
                "truthPath": "phase4-synthetic-truth.json",
                "labels": truth["labels"],
            }
        ],
    }
    (OUTPUT_DIRECTORY / "phase4-synthetic-dataset.json").write_text(
        json.dumps(dataset, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
