"""Dependency-free mirror of the cross-language DetectedStroke JSON boundary."""

from dataclasses import dataclass
from typing import Any, Literal, cast

DetectedStrokeFlag = Literal[
    "near-clipping",
    "weak-signal",
    "possible-double-trigger",
    "near-recording-boundary",
]
_ALLOWED_FLAGS = {
    "near-clipping",
    "weak-signal",
    "possible-double-trigger",
    "near-recording-boundary",
}


@dataclass(frozen=True, slots=True)
class DetectedStroke:
    id: str
    sample_index: int
    time_sec: float
    attack_strength_dbfs: float
    stroke_energy_dbfs: float
    relative_attack_db: float | None
    relative_energy_db: float | None
    confidence: float
    flags: tuple[DetectedStrokeFlag, ...]

    @classmethod
    def from_json(cls, value: dict[str, Any], sample_rate: int) -> "DetectedStroke":
        flags = value.get("flags", [])
        if not isinstance(flags, list) or any(flag not in _ALLOWED_FLAGS for flag in flags):
            raise ValueError("Unknown DetectedStroke flag")
        sample_index = int(value["sampleIndex"])
        time_sec = float(value["timeSec"])
        if abs(time_sec - sample_index / sample_rate) > 0.5 / sample_rate:
            raise ValueError("timeSec must agree with sampleIndex/sampleRate")
        confidence = float(value["confidence"])
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        return cls(
            id=str(value["id"]),
            sample_index=sample_index,
            time_sec=time_sec,
            attack_strength_dbfs=float(value["attackStrengthDbfs"]),
            stroke_energy_dbfs=float(value["strokeEnergyDbfs"]),
            relative_attack_db=_optional_float(value.get("relativeAttackDb")),
            relative_energy_db=_optional_float(value.get("relativeEnergyDb")),
            confidence=confidence,
            flags=tuple(cast(DetectedStrokeFlag, flag) for flag in flags),
        )


def _optional_float(value: object) -> float | None:
    return None if value is None else float(cast(float, value))


def load_detected_strokes(values: list[dict[str, Any]], sample_rate: int) -> list[DetectedStroke]:
    strokes = [DetectedStroke.from_json(value, sample_rate) for value in values]
    if any(
        left.sample_index > right.sample_index
        for left, right in zip(strokes, strokes[1:], strict=False)
    ):
        raise ValueError("Detected strokes must be ordered by sampleIndex")
    return strokes
