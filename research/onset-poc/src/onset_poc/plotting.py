"""Non-interactive diagnostic figures for onset error analysis."""

from __future__ import annotations

from pathlib import Path

import matplotlib
import numpy as np
import numpy.typing as npt

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402

from onset_poc.detector import DetectionResult
from onset_poc.evaluation import DetectionMetrics
from onset_poc.models import GroundTruthDocument


def save_diagnostic_plot(
    samples: npt.ArrayLike,
    result: DetectionResult,
    output: Path,
    *,
    truth: GroundTruthDocument | None = None,
    metrics: DetectionMetrics | None = None,
) -> None:
    waveform = np.asarray(samples, dtype=np.float64)
    times = np.arange(len(waveform), dtype=np.float64) / result.sample_rate
    figure, axes = plt.subplots(
        2,
        1,
        figsize=(14, 7),
        sharex=True,
        gridspec_kw={"height_ratios": [1.15, 1]},
        constrained_layout=True,
    )
    waveform_axis, envelope_axis = axes
    waveform_axis.plot(times, waveform, color="#263238", linewidth=0.65, label="waveform")
    for index, candidate in enumerate(result.diagnostics.candidate_samples):
        waveform_axis.axvline(
            candidate / result.sample_rate,
            color="#9e9e9e",
            linewidth=0.8,
            alpha=0.7,
            label="candidate peak" if index == 0 else None,
        )
    missed = set(metrics.missed_truth_ids) if metrics is not None else set()
    extra = set(metrics.extra_detected_ids) if metrics is not None else set()
    for index, stroke in enumerate(result.strokes):
        waveform_axis.axvline(
            stroke.time_sec,
            color="#d32f2f" if stroke.id in extra else "#2e7d32",
            linewidth=1.2,
            linestyle="--",
            label=("refined attack" if index == 0 else None),
        )
    if truth is not None:
        for index, event in enumerate(truth.events):
            waveform_axis.axvline(
                event.time_sec,
                color="#c62828" if event.id in missed else "#1565c0",
                linewidth=1.1,
                linestyle=":" if event.id not in missed else "-",
                label="truth" if index == 0 else None,
            )
    waveform_axis.set_ylabel("Amplitude")
    waveform_axis.set_title(f"{result.preset_name} · {len(result.strokes)} detected strokes")
    waveform_axis.legend(loc="upper right", ncols=4, fontsize=8)
    envelope_axis.plot(times, result.diagnostics.envelope_db, label="envelope", linewidth=0.8)
    envelope_axis.plot(
        times,
        result.diagnostics.noise_floor_db,
        label="local noise floor",
        linewidth=0.8,
    )
    envelope_axis.plot(times, result.diagnostics.threshold_db, label="threshold", linewidth=0.9)
    envelope_axis.set_ylim(-100, 2)
    envelope_axis.set_ylabel("Level (dBFS)")
    envelope_axis.set_xlabel("Time (s)")
    envelope_axis.legend(loc="upper right", ncols=3, fontsize=8)
    if metrics is not None:
        f1 = "—" if metrics.f1 is None else f"{metrics.f1:.3f}"
        mae = (
            "—"
            if metrics.timing_adjusted_mae_sec is None
            else f"{metrics.timing_adjusted_mae_sec * 1000:.2f} ms"
        )
        figure.suptitle(
            f"F1 {f1} · adjusted MAE {mae} · "
            f"miss {metrics.miss_count} · extra {metrics.extra_count}",
            fontsize=11,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(output, dpi=150)
    plt.close(figure)
