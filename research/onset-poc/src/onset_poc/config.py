"""Versioned onset detector configuration shared with the future Web detector."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, cast


@dataclass(frozen=True, slots=True)
class OnsetDetectorConfig:
    version: str = "phase-4-time-domain-1"
    preset_name: str = "practice-pad-baseline"
    high_pass_hz: float | None = 80.0
    envelope_window_ms: float = 1.5
    noise_floor_window_ms: float = 250.0
    threshold_offset_db: float = 12.0
    threshold_mad_multiplier: float = 6.0
    candidate_min_distance_ms: float = 18.0
    refinement_lookback_ms: float = 12.0
    refinement_rise_fraction: float = 0.1
    attack_window_ms: float = 8.0
    energy_window_ms: float = 30.0
    near_clipping_threshold_dbfs: float = -0.25
    use_spectral_flux: bool = False
    spectral_flux_weight: float = 0.0
    confidence_threshold: float = 0.5

    def validate(self) -> None:
        positive = {
            "envelopeWindowMs": self.envelope_window_ms,
            "noiseFloorWindowMs": self.noise_floor_window_ms,
            "thresholdOffsetDb": self.threshold_offset_db,
            "candidateMinDistanceMs": self.candidate_min_distance_ms,
            "refinementLookbackMs": self.refinement_lookback_ms,
            "attackWindowMs": self.attack_window_ms,
            "energyWindowMs": self.energy_window_ms,
        }
        for name, value in positive.items():
            if value <= 0:
                raise ValueError(f"{name} must be positive")
        if self.high_pass_hz is not None and self.high_pass_hz <= 0:
            raise ValueError("highPassHz must be positive or null")
        if self.threshold_mad_multiplier < 0:
            raise ValueError("thresholdMadMultiplier must be non-negative")
        if not 0 < self.refinement_rise_fraction < 1:
            raise ValueError("refinementRiseFraction must be between 0 and 1")
        if not 0 <= self.spectral_flux_weight <= 1:
            raise ValueError("spectralFluxWeight must be between 0 and 1")
        if not 0 <= self.confidence_threshold <= 1:
            raise ValueError("confidenceThreshold must be between 0 and 1")
        if self.near_clipping_threshold_dbfs > 0:
            raise ValueError("nearClippingThresholdDbfs must be at most 0")
        if self.use_spectral_flux:
            raise ValueError("Spectral flux is reserved for a later experimental detector")

    @classmethod
    def from_json(cls, value: dict[str, Any]) -> OnsetDetectorConfig:
        allowed = {
            "version",
            "presetName",
            "highPassHz",
            "envelopeWindowMs",
            "noiseFloorWindowMs",
            "thresholdOffsetDb",
            "thresholdMadMultiplier",
            "candidateMinDistanceMs",
            "refinementLookbackMs",
            "refinementRiseFraction",
            "attackWindowMs",
            "energyWindowMs",
            "nearClippingThresholdDbfs",
            "useSpectralFlux",
            "spectralFluxWeight",
            "confidenceThreshold",
        }
        unknown = set(value) - allowed
        if unknown:
            raise ValueError(f"Unknown detector config keys: {sorted(unknown)}")
        defaults = cls()
        config = cls(
            version=str(value.get("version", defaults.version)),
            preset_name=str(value.get("presetName", defaults.preset_name)),
            high_pass_hz=(
                None
                if value.get("highPassHz", defaults.high_pass_hz) is None
                else float(cast(float, value.get("highPassHz", defaults.high_pass_hz)))
            ),
            envelope_window_ms=float(value.get("envelopeWindowMs", defaults.envelope_window_ms)),
            noise_floor_window_ms=float(
                value.get("noiseFloorWindowMs", defaults.noise_floor_window_ms)
            ),
            threshold_offset_db=float(value.get("thresholdOffsetDb", defaults.threshold_offset_db)),
            threshold_mad_multiplier=float(
                value.get("thresholdMadMultiplier", defaults.threshold_mad_multiplier)
            ),
            candidate_min_distance_ms=float(
                value.get("candidateMinDistanceMs", defaults.candidate_min_distance_ms)
            ),
            refinement_lookback_ms=float(
                value.get("refinementLookbackMs", defaults.refinement_lookback_ms)
            ),
            refinement_rise_fraction=float(
                value.get("refinementRiseFraction", defaults.refinement_rise_fraction)
            ),
            attack_window_ms=float(value.get("attackWindowMs", defaults.attack_window_ms)),
            energy_window_ms=float(value.get("energyWindowMs", defaults.energy_window_ms)),
            near_clipping_threshold_dbfs=float(
                value.get("nearClippingThresholdDbfs", defaults.near_clipping_threshold_dbfs)
            ),
            use_spectral_flux=bool(value.get("useSpectralFlux", defaults.use_spectral_flux)),
            spectral_flux_weight=float(
                value.get("spectralFluxWeight", defaults.spectral_flux_weight)
            ),
            confidence_threshold=float(
                value.get("confidenceThreshold", defaults.confidence_threshold)
            ),
        )
        config.validate()
        return config

    def to_json(self) -> dict[str, object]:
        raw = asdict(self)
        return {
            "version": raw["version"],
            "presetName": raw["preset_name"],
            "highPassHz": raw["high_pass_hz"],
            "envelopeWindowMs": raw["envelope_window_ms"],
            "noiseFloorWindowMs": raw["noise_floor_window_ms"],
            "thresholdOffsetDb": raw["threshold_offset_db"],
            "thresholdMadMultiplier": raw["threshold_mad_multiplier"],
            "candidateMinDistanceMs": raw["candidate_min_distance_ms"],
            "refinementLookbackMs": raw["refinement_lookback_ms"],
            "refinementRiseFraction": raw["refinement_rise_fraction"],
            "attackWindowMs": raw["attack_window_ms"],
            "energyWindowMs": raw["energy_window_ms"],
            "nearClippingThresholdDbfs": raw["near_clipping_threshold_dbfs"],
            "useSpectralFlux": raw["use_spectral_flux"],
            "spectralFluxWeight": raw["spectral_flux_weight"],
            "confidenceThreshold": raw["confidence_threshold"],
        }

    def with_overrides(self, overrides: dict[str, object]) -> OnsetDetectorConfig:
        return self.from_json(self.to_json() | overrides)


def load_config(path: Path | None) -> OnsetDetectorConfig:
    if path is None:
        config = OnsetDetectorConfig()
    else:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Detector config must be a JSON object")
        config = OnsetDetectorConfig.from_json(value)
    config.validate()
    return config
