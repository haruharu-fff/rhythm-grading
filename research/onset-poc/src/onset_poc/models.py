"""Cross-language JSON contracts used by the onset research package."""

from __future__ import annotations

from dataclasses import dataclass, field
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


def _require_non_empty_string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be a non-empty string")
    return value


def _optional_float(value: object) -> float | None:
    return None if value is None else float(cast(float, value))


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
    def from_json(cls, value: dict[str, Any], sample_rate: int) -> DetectedStroke:
        flags = value.get("flags", [])
        if not isinstance(flags, list) or any(flag not in _ALLOWED_FLAGS for flag in flags):
            raise ValueError("Unknown DetectedStroke flag")
        sample_index = int(value["sampleIndex"])
        if sample_index < 0:
            raise ValueError("sampleIndex must be non-negative")
        time_sec = float(value["timeSec"])
        if abs(time_sec - sample_index / sample_rate) > 0.5 / sample_rate:
            raise ValueError("timeSec must agree with sampleIndex/sampleRate")
        confidence = float(value["confidence"])
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        return cls(
            id=_require_non_empty_string(value["id"], "id"),
            sample_index=sample_index,
            time_sec=time_sec,
            attack_strength_dbfs=float(value["attackStrengthDbfs"]),
            stroke_energy_dbfs=float(value["strokeEnergyDbfs"]),
            relative_attack_db=_optional_float(value.get("relativeAttackDb")),
            relative_energy_db=_optional_float(value.get("relativeEnergyDb")),
            confidence=confidence,
            flags=tuple(cast(DetectedStrokeFlag, flag) for flag in flags),
        )

    def to_json(self) -> dict[str, object]:
        return {
            "id": self.id,
            "sampleIndex": self.sample_index,
            "timeSec": self.time_sec,
            "attackStrengthDbfs": self.attack_strength_dbfs,
            "strokeEnergyDbfs": self.stroke_energy_dbfs,
            "relativeAttackDb": self.relative_attack_db,
            "relativeEnergyDb": self.relative_energy_db,
            "confidence": self.confidence,
            "flags": list(self.flags),
        }


def load_detected_strokes(values: list[dict[str, Any]], sample_rate: int) -> list[DetectedStroke]:
    strokes = [DetectedStroke.from_json(value, sample_rate) for value in values]
    if any(
        left.sample_index > right.sample_index
        for left, right in zip(strokes, strokes[1:], strict=False)
    ):
        raise ValueError("Detected strokes must be ordered by sampleIndex")
    if len({stroke.id for stroke in strokes}) != len(strokes):
        raise ValueError("Detected stroke ids must be unique")
    return strokes


@dataclass(frozen=True, slots=True)
class GroundTruthEvent:
    id: str
    sample_index: int
    time_sec: float
    labels: dict[str, str | float] = field(default_factory=dict)

    @classmethod
    def from_json(cls, value: dict[str, Any], sample_rate: int) -> GroundTruthEvent:
        sample_index = int(value["sampleIndex"])
        if sample_index < 0:
            raise ValueError("Ground truth sampleIndex must be non-negative")
        time_sec = float(value.get("timeSec", sample_index / sample_rate))
        if abs(time_sec - sample_index / sample_rate) > 0.5 / sample_rate:
            raise ValueError("Ground truth timeSec must agree with sampleIndex/sampleRate")
        raw_labels = value.get("labels", {})
        if not isinstance(raw_labels, dict) or any(
            not isinstance(key, str) or not isinstance(item, str | int | float)
            for key, item in raw_labels.items()
        ):
            raise ValueError("Ground truth labels must contain string or numeric values")
        labels = {
            str(key): float(item) if isinstance(item, int | float) else item
            for key, item in raw_labels.items()
        }
        return cls(
            id=_require_non_empty_string(value["id"], "ground truth event id"),
            sample_index=sample_index,
            time_sec=time_sec,
            labels=labels,
        )

    def to_json(self) -> dict[str, object]:
        result: dict[str, object] = {
            "id": self.id,
            "sampleIndex": self.sample_index,
            "timeSec": self.time_sec,
        }
        if self.labels:
            result["labels"] = self.labels
        return result


@dataclass(frozen=True, slots=True)
class GroundTruthDocument:
    schema_version: Literal["1.0"]
    audio_path: str
    sample_rate: int
    frame_count: int
    duration_sec: float
    events: tuple[GroundTruthEvent, ...]
    labels: dict[str, str | float] = field(default_factory=dict)

    @classmethod
    def from_json(cls, value: dict[str, Any]) -> GroundTruthDocument:
        if value.get("schemaVersion") != "1.0":
            raise ValueError("Unsupported ground truth schemaVersion")
        sample_rate = int(value["sampleRate"])
        frame_count = int(value["frameCount"])
        if sample_rate <= 0 or frame_count <= 0:
            raise ValueError("sampleRate and frameCount must be valid")
        duration_sec = float(value.get("durationSec", frame_count / sample_rate))
        if abs(duration_sec - frame_count / sample_rate) > 0.5 / sample_rate:
            raise ValueError("durationSec must agree with frameCount/sampleRate")
        raw_events = value.get("events")
        if not isinstance(raw_events, list):
            raise ValueError("events must be an array")
        events = tuple(GroundTruthEvent.from_json(event, sample_rate) for event in raw_events)
        if any(
            left.sample_index > right.sample_index
            for left, right in zip(events, events[1:], strict=False)
        ):
            raise ValueError("Ground truth events must be ordered by sampleIndex")
        if any(event.sample_index >= frame_count for event in events):
            raise ValueError("Ground truth event lies outside audio")
        if len({event.id for event in events}) != len(events):
            raise ValueError("Ground truth event ids must be unique")
        raw_labels = value.get("labels", {})
        if not isinstance(raw_labels, dict) or any(
            not isinstance(key, str) or not isinstance(item, str | int | float)
            for key, item in raw_labels.items()
        ):
            raise ValueError("labels must contain string or numeric values")
        labels = {
            str(key): float(item) if isinstance(item, int | float) else item
            for key, item in raw_labels.items()
        }
        return cls(
            schema_version="1.0",
            audio_path=_require_non_empty_string(value["audioPath"], "audioPath"),
            sample_rate=sample_rate,
            frame_count=frame_count,
            duration_sec=duration_sec,
            events=events,
            labels=labels,
        )

    def to_json(self) -> dict[str, object]:
        return {
            "schemaVersion": self.schema_version,
            "audioPath": self.audio_path,
            "sampleRate": self.sample_rate,
            "frameCount": self.frame_count,
            "durationSec": self.duration_sec,
            "labels": self.labels,
            "events": [event.to_json() for event in self.events],
        }


@dataclass(frozen=True, slots=True)
class DatasetItem:
    id: str
    wav_path: str
    truth_path: str
    labels: dict[str, str | float]


@dataclass(frozen=True, slots=True)
class DatasetManifest:
    schema_version: Literal["1.0"]
    items: tuple[DatasetItem, ...]

    @classmethod
    def from_json(cls, value: dict[str, Any]) -> DatasetManifest:
        if value.get("schemaVersion") != "1.0":
            raise ValueError("Unsupported dataset schemaVersion")
        raw_items = value.get("items")
        if not isinstance(raw_items, list) or not raw_items:
            raise ValueError("Dataset items must be a non-empty array")
        items: list[DatasetItem] = []
        for raw in raw_items:
            if not isinstance(raw, dict):
                raise ValueError("Dataset item must be an object")
            raw_labels = raw.get("labels", {})
            if not isinstance(raw_labels, dict):
                raise ValueError("Dataset item labels must be an object")
            labels = {
                str(key): float(item) if isinstance(item, int | float) else str(item)
                for key, item in raw_labels.items()
            }
            items.append(
                DatasetItem(
                    id=_require_non_empty_string(raw["id"], "dataset item id"),
                    wav_path=_require_non_empty_string(raw["wavPath"], "wavPath"),
                    truth_path=_require_non_empty_string(raw["truthPath"], "truthPath"),
                    labels=labels,
                )
            )
        if len({item.id for item in items}) != len(items):
            raise ValueError("Dataset item ids must be unique")
        return cls(schema_version="1.0", items=tuple(items))
