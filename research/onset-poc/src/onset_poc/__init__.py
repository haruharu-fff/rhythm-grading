"""Reference onset detector and cross-language data boundary."""

from onset_poc.config import OnsetDetectorConfig
from onset_poc.detector import DetectionResult, detect_onsets
from onset_poc.evaluation import DetectionMetrics, evaluate_detections
from onset_poc.models import (
    DatasetManifest,
    DetectedStroke,
    GroundTruthDocument,
    GroundTruthEvent,
    load_detected_strokes,
)

__all__ = [
    "DatasetManifest",
    "DetectedStroke",
    "DetectionMetrics",
    "DetectionResult",
    "GroundTruthDocument",
    "GroundTruthEvent",
    "OnsetDetectorConfig",
    "detect_onsets",
    "evaluate_detections",
    "load_detected_strokes",
]
