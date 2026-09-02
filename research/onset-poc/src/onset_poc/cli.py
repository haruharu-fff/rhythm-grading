"""Command line entry points for detector research workflows."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

from onset_poc.audio import load_wav
from onset_poc.config import load_config
from onset_poc.detector import detect_onsets
from onset_poc.evaluation import evaluate_detections
from onset_poc.plotting import save_diagnostic_plot
from onset_poc.serialization import load_detection_file, load_truth, write_json
from onset_poc.sweep import run_sweep, write_experiment_report


def _path(value: str) -> Path:
    return Path(value)


def _add_config(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", type=_path, help="Detector config JSON; uses baseline defaults")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="onset-poc")
    subparsers = parser.add_subparsers(dest="command", required=True)

    detect = subparsers.add_parser("detect", help="Detect attacks in a WAV file")
    detect.add_argument("wav", type=_path)
    detect.add_argument("--output", type=_path, required=True)
    detect.add_argument("--plot", type=_path, help="Optional diagnostic PNG")
    detect.add_argument("--channel", type=int, help="0-based input channel; default mixes to mono")
    _add_config(detect)

    evaluate = subparsers.add_parser("evaluate", help="Compare detected strokes with truth")
    evaluate.add_argument("detected", type=_path)
    evaluate.add_argument("truth", type=_path)
    evaluate.add_argument("--output", type=_path, required=True)
    evaluate.add_argument("--tolerance-ms", type=float, default=25.0)
    evaluate.add_argument("--maximum-offset-ms", type=float, default=500.0)

    sweep = subparsers.add_parser("sweep", help="Evaluate a detector config grid")
    sweep.add_argument("dataset", type=_path)
    sweep.add_argument("grid", type=_path)
    sweep.add_argument("--output", type=_path, required=True)
    sweep.add_argument("--report", type=_path, help="Optional generated Markdown report")
    sweep.add_argument("--tolerance-ms", type=float, default=25.0)
    sweep.add_argument("--maximum-offset-ms", type=float, default=500.0)
    _add_config(sweep)

    visualize = subparsers.add_parser(
        "visualize", help="Plot waveform, detector traces, predictions, and truth"
    )
    visualize.add_argument("wav", type=_path)
    visualize.add_argument("truth", type=_path)
    visualize.add_argument("--output", type=_path, required=True)
    visualize.add_argument("--metrics-output", type=_path)
    visualize.add_argument(
        "--channel", type=int, help="0-based input channel; default mixes to mono"
    )
    visualize.add_argument("--tolerance-ms", type=float, default=25.0)
    visualize.add_argument("--maximum-offset-ms", type=float, default=500.0)
    _add_config(visualize)
    return parser


def _detect(args: argparse.Namespace) -> int:
    audio = load_wav(args.wav, args.channel)
    config = load_config(args.config)
    result = detect_onsets(audio.samples, audio.sample_rate, config)
    write_json(args.output, result.strokes_json())
    if args.plot is not None:
        save_diagnostic_plot(audio.samples, result, args.plot)
    print(f"detected={len(result.strokes)} output={args.output}")
    return 0


def _evaluate(args: argparse.Namespace) -> int:
    truth = load_truth(args.truth)
    detected = load_detection_file(args.detected, truth.sample_rate)
    metrics = evaluate_detections(
        truth,
        detected,
        tolerance_ms=args.tolerance_ms,
        maximum_offset_ms=args.maximum_offset_ms,
    )
    write_json(args.output, metrics.to_json())
    f1 = "undefined" if metrics.f1 is None else f"{metrics.f1:.4f}"
    print(f"f1={f1} miss={metrics.miss_count} extra={metrics.extra_count}")
    return 0


def _sweep(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    rows = run_sweep(
        args.dataset,
        args.grid,
        args.output,
        base_config=config,
        tolerance_ms=args.tolerance_ms,
        maximum_offset_ms=args.maximum_offset_ms,
    )
    if args.report is not None:
        write_experiment_report(args.report, rows)
    print(f"rows={len(rows)} output={args.output}")
    return 0


def _visualize(args: argparse.Namespace) -> int:
    audio = load_wav(args.wav, args.channel)
    truth = load_truth(args.truth)
    if truth.sample_rate != audio.sample_rate or truth.frame_count != len(audio.samples):
        raise ValueError("WAV metadata does not match ground truth")
    config = load_config(args.config)
    result = detect_onsets(audio.samples, audio.sample_rate, config)
    metrics = evaluate_detections(
        truth,
        result.strokes,
        tolerance_ms=args.tolerance_ms,
        maximum_offset_ms=args.maximum_offset_ms,
    )
    save_diagnostic_plot(audio.samples, result, args.output, truth=truth, metrics=metrics)
    if args.metrics_output is not None:
        write_json(args.metrics_output, metrics.to_json())
    print(f"plot={args.output} miss={metrics.miss_count} extra={metrics.extra_count}")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {
        "detect": _detect,
        "evaluate": _evaluate,
        "sweep": _sweep,
        "visualize": _visualize,
    }
    return handlers[args.command](args)
