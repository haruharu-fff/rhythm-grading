"""Deterministic time-domain baseline onset detector."""

from __future__ import annotations

from dataclasses import dataclass
from math import log10

import numpy as np
import numpy.typing as npt
from scipy import ndimage, signal  # type: ignore[import-untyped]

from onset_poc.config import OnsetDetectorConfig
from onset_poc.models import DetectedStroke, DetectedStrokeFlag

FloatArray = npt.NDArray[np.float64]
IntArray = npt.NDArray[np.int64]
_DB_FLOOR = -160.0


@dataclass(frozen=True, slots=True)
class DetectorDiagnostics:
    filtered: FloatArray
    envelope: FloatArray
    envelope_db: FloatArray
    noise_floor_db: FloatArray
    threshold_db: FloatArray
    candidate_samples: IntArray
    refined_samples: IntArray


@dataclass(frozen=True, slots=True)
class DetectionResult:
    sample_rate: int
    strokes: tuple[DetectedStroke, ...]
    diagnostics: DetectorDiagnostics
    detector_version: str
    preset_name: str

    def strokes_json(self) -> list[dict[str, object]]:
        return [stroke.to_json() for stroke in self.strokes]


def _samples_for_ms(milliseconds: float, sample_rate: int, *, odd: bool = False) -> int:
    value = max(1, round(milliseconds * sample_rate / 1000))
    if odd and value % 2 == 0:
        value += 1
    return value


def _amplitude_db(values: FloatArray) -> FloatArray:
    result = np.maximum(20 * np.log10(np.maximum(values, 10 ** (_DB_FLOOR / 20))), _DB_FLOOR)
    return np.asarray(result, dtype=np.float64)


def _rms_db(samples: FloatArray) -> float:
    if len(samples) == 0:
        return _DB_FLOOR
    rms = float(np.sqrt(np.mean(np.square(samples), dtype=np.float64)))
    return min(0.0, max(_DB_FLOOR, 20 * log10(max(rms, 10 ** (_DB_FLOOR / 20)))))


def _preprocess(samples: FloatArray, sample_rate: int, config: OnsetDetectorConfig) -> FloatArray:
    centered = np.asarray(samples, dtype=np.float64) - float(np.mean(samples))
    if config.high_pass_hz is None:
        return centered
    if config.high_pass_hz >= sample_rate / 2:
        raise ValueError("highPassHz must be below the Nyquist frequency")
    sos = signal.butter(2, config.high_pass_hz, btype="highpass", fs=sample_rate, output="sos")
    return np.asarray(signal.sosfilt(sos, centered), dtype=np.float64)


def _envelope(filtered: FloatArray, sample_rate: int, config: OnsetDetectorConfig) -> FloatArray:
    window = _samples_for_ms(config.envelope_window_ms, sample_rate)
    kernel = np.full(window, 1 / window, dtype=np.float64)
    mean_square = signal.lfilter(kernel, [1.0], np.square(filtered))
    return np.asarray(np.sqrt(np.maximum(mean_square, 0)), dtype=np.float64)


def _adaptive_threshold(
    envelope_db: FloatArray, sample_rate: int, config: OnsetDetectorConfig
) -> tuple[FloatArray, FloatArray]:
    window = _samples_for_ms(config.noise_floor_window_ms, sample_rate, odd=True)
    noise_floor = np.asarray(
        ndimage.median_filter(envelope_db, size=window, mode="nearest"), dtype=np.float64
    )
    absolute_deviation = np.abs(envelope_db - noise_floor)
    local_mad = np.asarray(
        ndimage.median_filter(absolute_deviation, size=window, mode="nearest"),
        dtype=np.float64,
    )
    adaptive_margin = np.maximum(
        config.threshold_offset_db,
        config.threshold_mad_multiplier * 1.4826 * local_mad,
    )
    return noise_floor, np.minimum(noise_floor + adaptive_margin, 0.0)


def _candidate_samples(
    envelope_db: FloatArray, threshold_db: FloatArray, sample_rate: int, config: OnsetDetectorConfig
) -> IntArray:
    minimum_distance = _samples_for_ms(config.candidate_min_distance_ms, sample_rate)
    peaks, _ = signal.find_peaks(
        envelope_db,
        distance=minimum_distance,
        prominence=max(1.0, config.threshold_offset_db / 3),
    )
    return np.asarray(peaks[envelope_db[peaks] > threshold_db[peaks]], dtype=np.int64)


def _refine_candidate(
    candidate: int,
    envelope: FloatArray,
    sample_rate: int,
    config: OnsetDetectorConfig,
) -> int:
    lookback = _samples_for_ms(config.refinement_lookback_ms, sample_rate)
    start = max(0, candidate - lookback)
    local = envelope[start : candidate + 1]
    baseline_width = max(1, len(local) // 4)
    baseline = float(np.median(local[:baseline_width]))
    peak = float(envelope[candidate])
    rise_threshold = baseline + config.refinement_rise_fraction * max(0.0, peak - baseline)
    above = local >= rise_threshold
    sustain = max(1, _samples_for_ms(config.envelope_window_ms / 4, sample_rate))
    if sustain > 1 and len(above) >= sustain:
        counts = np.convolve(above.astype(np.int8), np.ones(sustain, dtype=np.int8), mode="valid")
        crossings = np.flatnonzero(counts == sustain)
    else:
        crossings = np.flatnonzero(above)
    return candidate if len(crossings) == 0 else start + int(crossings[0])


def _confidence(
    candidate: int,
    refined: int,
    envelope_db: FloatArray,
    threshold_db: FloatArray,
    sample_rate: int,
    config: OnsetDetectorConfig,
    near_clipping: bool,
    near_boundary: bool,
) -> float:
    excess_db = max(0.0, float(envelope_db[candidate] - threshold_db[candidate]))
    clarity = 1 - np.exp(-excess_db / max(3.0, config.threshold_offset_db))
    lookback = _samples_for_ms(config.refinement_lookback_ms, sample_rate)
    refinement_stability = 1 - min(1.0, (candidate - refined) / lookback)
    value = 0.72 * clarity + 0.28 * refinement_stability
    if near_clipping:
        value *= 0.82
    if near_boundary:
        value *= 0.82
    return float(np.clip(value, 0, 1))


def detect_onsets(
    samples: npt.ArrayLike, sample_rate: int, config: OnsetDetectorConfig
) -> DetectionResult:
    config.validate()
    if sample_rate <= 0:
        raise ValueError("sample_rate must be positive")
    waveform = np.asarray(samples, dtype=np.float64)
    if waveform.ndim != 1 or len(waveform) == 0:
        raise ValueError("samples must be a non-empty mono array")
    if not np.all(np.isfinite(waveform)):
        raise ValueError("samples must be finite")
    filtered = _preprocess(waveform, sample_rate, config)
    envelope = _envelope(filtered, sample_rate, config)
    envelope_db = _amplitude_db(envelope)
    noise_floor_db, threshold_db = _adaptive_threshold(envelope_db, sample_rate, config)
    candidates = _candidate_samples(envelope_db, threshold_db, sample_rate, config)
    refined = np.asarray(
        [
            _refine_candidate(int(candidate), envelope, sample_rate, config)
            for candidate in candidates
        ],
        dtype=np.int64,
    )
    # Refinement can collapse candidates onto the same attack; retain the clearer one.
    unique_pairs: list[tuple[int, int]] = []
    for candidate, attack in zip(candidates.tolist(), refined.tolist(), strict=True):
        if unique_pairs and attack == unique_pairs[-1][1]:
            previous_candidate = unique_pairs[-1][0]
            if envelope_db[candidate] > envelope_db[previous_candidate]:
                unique_pairs[-1] = (candidate, attack)
        else:
            unique_pairs.append((candidate, attack))

    attack_window = _samples_for_ms(config.attack_window_ms, sample_rate)
    energy_window = _samples_for_ms(config.energy_window_ms, sample_rate)
    boundary_margin = max(
        energy_window, _samples_for_ms(config.refinement_lookback_ms, sample_rate)
    )
    temporary: list[tuple[int, float, float, float, list[DetectedStrokeFlag]]] = []
    for index, (candidate, attack) in enumerate(unique_pairs):
        next_attack = unique_pairs[index + 1][1] if index + 1 < len(unique_pairs) else len(filtered)
        attack_end = min(len(filtered), next_attack, attack + attack_window)
        energy_end = min(len(filtered), next_attack, attack + energy_window)
        near_clipping = bool(
            np.max(np.abs(waveform[attack:energy_end]), initial=0.0)
            >= 10 ** (config.near_clipping_threshold_dbfs / 20)
        )
        near_boundary = attack < boundary_margin or attack + boundary_margin >= len(filtered)
        confidence = _confidence(
            candidate,
            attack,
            envelope_db,
            threshold_db,
            sample_rate,
            config,
            near_clipping,
            near_boundary,
        )
        # Keep borderline evidence for error analysis, but discard extremely weak tail
        # re-crossings which are neither stable attacks nor useful low-confidence events.
        if confidence < config.confidence_threshold * 0.5:
            continue
        flags: list[DetectedStrokeFlag] = []
        if near_clipping:
            flags.append("near-clipping")
        if confidence < config.confidence_threshold:
            flags.append("weak-signal")
        if near_boundary:
            flags.append("near-recording-boundary")
        minimum_distance = _samples_for_ms(config.candidate_min_distance_ms, sample_rate)
        if index > 0 and attack - unique_pairs[index - 1][1] < round(1.5 * minimum_distance):
            flags.append("possible-double-trigger")
        temporary.append(
            (
                attack,
                _rms_db(filtered[attack:attack_end]),
                _rms_db(filtered[attack:energy_end]),
                confidence,
                flags,
            )
        )

    reference_attacks = [
        attack_db
        for _, attack_db, _, confidence, flags in temporary
        if confidence >= config.confidence_threshold and "near-clipping" not in flags
    ]
    reference_energies = [
        energy_db
        for _, _, energy_db, confidence, flags in temporary
        if confidence >= config.confidence_threshold and "near-clipping" not in flags
    ]
    attack_median = float(np.median(reference_attacks)) if len(reference_attacks) >= 3 else None
    energy_median = float(np.median(reference_energies)) if len(reference_energies) >= 3 else None
    strokes = tuple(
        DetectedStroke(
            id=f"det-{index:04d}",
            sample_index=attack,
            time_sec=attack / sample_rate,
            attack_strength_dbfs=attack_db,
            stroke_energy_dbfs=energy_db,
            relative_attack_db=None if attack_median is None else attack_db - attack_median,
            relative_energy_db=None if energy_median is None else energy_db - energy_median,
            confidence=confidence,
            flags=tuple(flags),
        )
        for index, (attack, attack_db, energy_db, confidence, flags) in enumerate(temporary)
    )
    return DetectionResult(
        sample_rate=sample_rate,
        strokes=strokes,
        diagnostics=DetectorDiagnostics(
            filtered=filtered,
            envelope=envelope,
            envelope_db=envelope_db,
            noise_floor_db=noise_floor_db,
            threshold_db=threshold_db,
            candidate_samples=np.asarray([item[0] for item in unique_pairs], dtype=np.int64),
            refined_samples=np.asarray([item[1] for item in unique_pairs], dtype=np.int64),
        ),
        detector_version=config.version,
        preset_name=config.preset_name,
    )
