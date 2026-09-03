"""Truth matching and detector metrics independent from the score matcher."""

from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from statistics import fmean, median

import numpy as np

from onset_poc.models import DetectedStroke, GroundTruthDocument


@dataclass(frozen=True, slots=True)
class DetectionMatch:
    truth_id: str
    detected_id: str
    truth_time_sec: float
    detected_time_sec: float
    raw_error_sec: float
    offset_adjusted_error_sec: float

    def to_json(self) -> dict[str, object]:
        return {
            "truthId": self.truth_id,
            "detectedId": self.detected_id,
            "truthTimeSec": self.truth_time_sec,
            "detectedTimeSec": self.detected_time_sec,
            "rawErrorSec": self.raw_error_sec,
            "offsetAdjustedErrorSec": self.offset_adjusted_error_sec,
        }


@dataclass(frozen=True, slots=True)
class DetectionMetrics:
    tolerance_ms: float
    duration_sec: float
    estimated_offset_sec: float
    truth_count: int
    detected_count: int
    matched_count: int
    miss_count: int
    extra_count: int
    precision: float | None
    recall: float | None
    f1: float | None
    false_positives_per_minute: float
    timing_signed_mean_sec: float | None
    timing_adjusted_mae_sec: float | None
    timing_adjusted_sd_sec: float | None
    timing_adjusted_p95_sec: float | None
    matches: tuple[DetectionMatch, ...]
    missed_truth_ids: tuple[str, ...]
    extra_detected_ids: tuple[str, ...]

    def to_json(self) -> dict[str, object]:
        return {
            "schemaVersion": "1.0",
            "toleranceMs": self.tolerance_ms,
            "durationSec": self.duration_sec,
            "estimatedOffsetSec": self.estimated_offset_sec,
            "counts": {
                "truth": self.truth_count,
                "detected": self.detected_count,
                "matched": self.matched_count,
                "miss": self.miss_count,
                "extra": self.extra_count,
            },
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "falsePositivesPerMinute": self.false_positives_per_minute,
            "timing": {
                "signedMeanSec": self.timing_signed_mean_sec,
                "offsetAdjustedMaeSec": self.timing_adjusted_mae_sec,
                "offsetAdjustedSdSec": self.timing_adjusted_sd_sec,
                "offsetAdjustedP95Sec": self.timing_adjusted_p95_sec,
            },
            "matches": [match.to_json() for match in self.matches],
            "missedTruthIds": list(self.missed_truth_ids),
            "extraDetectedIds": list(self.extra_detected_ids),
        }


@dataclass(frozen=True, slots=True)
class _Alignment:
    pairs: tuple[tuple[int, int], ...]
    misses: tuple[int, ...]
    extras: tuple[int, ...]
    cost: float


def _align(
    truth_times: list[float], prediction_times: list[float], offset: float, tolerance: float
) -> _Alignment:
    rows = len(truth_times) + 1
    columns = len(prediction_times) + 1
    costs = np.full((rows, columns), np.inf, dtype=np.float64)
    operations = np.zeros((rows, columns), dtype=np.int8)
    costs[:, 0] = np.arange(rows, dtype=np.float64)
    costs[0, :] = np.arange(columns, dtype=np.float64)
    operations[1:, 0] = 2
    operations[0, 1:] = 3
    for truth_index, truth_time in enumerate(truth_times, start=1):
        for detected_index, detected_time in enumerate(prediction_times, start=1):
            error = abs((detected_time - offset) - truth_time)
            match_cost = (
                costs[truth_index - 1, detected_index - 1] + error / tolerance
                if error <= tolerance
                else np.inf
            )
            miss_cost = costs[truth_index - 1, detected_index] + 1
            extra_cost = costs[truth_index, detected_index - 1] + 1
            options = (match_cost, miss_cost, extra_cost)
            operation = int(np.argmin(options)) + 1
            costs[truth_index, detected_index] = options[operation - 1]
            operations[truth_index, detected_index] = operation
    truth_index = len(truth_times)
    detected_index = len(prediction_times)
    pairs: list[tuple[int, int]] = []
    misses: list[int] = []
    extras: list[int] = []
    while truth_index > 0 or detected_index > 0:
        operation = int(operations[truth_index, detected_index])
        if operation == 1:
            pairs.append((truth_index - 1, detected_index - 1))
            truth_index -= 1
            detected_index -= 1
        elif operation == 2:
            misses.append(truth_index - 1)
            truth_index -= 1
        else:
            extras.append(detected_index - 1)
            detected_index -= 1
    return _Alignment(
        pairs=tuple(reversed(pairs)),
        misses=tuple(reversed(misses)),
        extras=tuple(reversed(extras)),
        cost=float(costs[-1, -1]),
    )


def _offset_candidates(
    truth_times: list[float], prediction_times: list[float], maximum_offset: float
) -> list[float]:
    candidates = {0.0}
    window = 12
    for truth_time in truth_times[:window]:
        for prediction_time in prediction_times[:window]:
            difference = prediction_time - truth_time
            if abs(difference) <= maximum_offset:
                candidates.add(difference)
    return sorted(candidates, key=lambda value: (abs(value), value))


def _best_alignment(
    truth_times: list[float],
    prediction_times: list[float],
    tolerance: float,
    maximum_offset: float,
) -> tuple[_Alignment, float]:
    best: _Alignment | None = None
    best_offset = 0.0
    for offset in _offset_candidates(truth_times, prediction_times, maximum_offset):
        alignment = _align(truth_times, prediction_times, offset, tolerance)
        key = (-len(alignment.pairs), alignment.cost, abs(offset), offset)
        best_key = (
            (-len(best.pairs), best.cost, abs(best_offset), best_offset)
            if best is not None
            else None
        )
        if best_key is None or key < best_key:
            best = alignment
            best_offset = offset
    if best is None:
        best = _align(truth_times, prediction_times, 0.0, tolerance)
    if best.pairs:
        best_offset = median(
            prediction_times[detected_index] - truth_times[truth_index]
            for truth_index, detected_index in best.pairs
        )
        best = _align(truth_times, prediction_times, best_offset, tolerance)
    return best, best_offset


def _safe_ratio(numerator: int, denominator: int) -> float | None:
    return None if denominator == 0 else numerator / denominator


def evaluate_detections(
    truth: GroundTruthDocument,
    detected: list[DetectedStroke] | tuple[DetectedStroke, ...],
    *,
    tolerance_ms: float = 25.0,
    maximum_offset_ms: float = 500.0,
) -> DetectionMetrics:
    if tolerance_ms <= 0 or maximum_offset_ms < 0:
        raise ValueError("Evaluation windows must be valid")
    truth_times = [event.time_sec for event in truth.events]
    prediction_times = [stroke.time_sec for stroke in detected]
    tolerance = tolerance_ms / 1000
    alignment, offset = _best_alignment(
        truth_times, prediction_times, tolerance, maximum_offset_ms / 1000
    )
    raw_errors = [
        prediction_times[detected_index] - truth_times[truth_index]
        for truth_index, detected_index in alignment.pairs
    ]
    adjusted_errors = [error - offset for error in raw_errors]
    matches = tuple(
        DetectionMatch(
            truth_id=truth.events[truth_index].id,
            detected_id=detected[detected_index].id,
            truth_time_sec=truth_times[truth_index],
            detected_time_sec=prediction_times[detected_index],
            raw_error_sec=raw_errors[index],
            offset_adjusted_error_sec=adjusted_errors[index],
        )
        for index, (truth_index, detected_index) in enumerate(alignment.pairs)
    )
    matched_count = len(matches)
    precision = _safe_ratio(matched_count, len(detected))
    recall = _safe_ratio(matched_count, len(truth.events))
    f1 = (
        None
        if precision is None or recall is None or precision + recall == 0
        else 2 * precision * recall / (precision + recall)
    )
    adjusted_mean = fmean(adjusted_errors) if adjusted_errors else None
    adjusted_sd = (
        sqrt(fmean((value - adjusted_mean) ** 2 for value in adjusted_errors))
        if adjusted_mean is not None
        else None
    )
    return DetectionMetrics(
        tolerance_ms=tolerance_ms,
        duration_sec=truth.duration_sec,
        estimated_offset_sec=offset,
        truth_count=len(truth.events),
        detected_count=len(detected),
        matched_count=matched_count,
        miss_count=len(alignment.misses),
        extra_count=len(alignment.extras),
        precision=precision,
        recall=recall,
        f1=f1,
        false_positives_per_minute=(len(alignment.extras) * 60 / truth.duration_sec),
        timing_signed_mean_sec=fmean(raw_errors) if raw_errors else None,
        timing_adjusted_mae_sec=(
            fmean(abs(value) for value in adjusted_errors) if adjusted_errors else None
        ),
        timing_adjusted_sd_sec=adjusted_sd,
        timing_adjusted_p95_sec=(
            float(np.percentile(np.abs(adjusted_errors), 95)) if adjusted_errors else None
        ),
        matches=matches,
        missed_truth_ids=tuple(truth.events[index].id for index in alignment.misses),
        extra_detected_ids=tuple(detected[index].id for index in alignment.extras),
    )
