"""Research-only onset detector boundary.

The detector itself starts in Phase 4. Phase 0 defines the shared JSON contract only.
"""

from onset_poc.models import DetectedStroke, load_detected_strokes

__all__ = ["DetectedStroke", "load_detected_strokes"]
