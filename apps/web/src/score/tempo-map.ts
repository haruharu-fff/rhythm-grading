import type { CompiledTempoSegment, Fraction, ScoreDocument } from "../domain";
import {
  addFractions,
  compareFractions,
  fraction,
  fractionToNumber,
  multiplyFractions,
  subtractFractions,
} from "./fraction";

export interface TempoMap {
  readonly segments: CompiledTempoSegment[];
  readonly durationSec: number;
  beatToSeconds(beat: Fraction): number;
  secondsToBeatPosition(seconds: number): number;
}

export function compileTempoMap(score: ScoreDocument): TempoMap {
  const sortedChanges = [...score.tempoChanges].sort((left, right) => {
    const byBeat = compareFractions(left.beat, right.beat);
    return byBeat !== 0 ? byBeat : left.bpm - right.bpm;
  });
  let currentBeat = fraction(0);
  let currentTimeSec = 0;
  let currentBpm = score.initialTempoBpm;
  const segments: CompiledTempoSegment[] = [];

  for (const change of sortedChanges) {
    if (compareFractions(change.beat, currentBeat) === 0) {
      currentBpm = change.bpm;
      continue;
    }
    const durationBeats = fractionToNumber(
      subtractFractions(change.beat, currentBeat),
    );
    const endTimeSec = currentTimeSec + (durationBeats * 60) / currentBpm;
    segments.push({
      startBeat: currentBeat,
      endBeat: change.beat,
      startTimeSec: currentTimeSec,
      endTimeSec,
      bpm: currentBpm,
    });
    currentBeat = change.beat;
    currentTimeSec = endTimeSec;
    currentBpm = change.bpm;
  }
  if (compareFractions(currentBeat, score.lengthBeats) < 0) {
    const durationBeats = fractionToNumber(
      subtractFractions(score.lengthBeats, currentBeat),
    );
    const endTimeSec = currentTimeSec + (durationBeats * 60) / currentBpm;
    segments.push({
      startBeat: currentBeat,
      endBeat: score.lengthBeats,
      startTimeSec: currentTimeSec,
      endTimeSec,
      bpm: currentBpm,
    });
    currentTimeSec = endTimeSec;
  }

  const beatToSeconds = (beat: Fraction): number => {
    if (
      compareFractions(beat, fraction(0)) < 0 ||
      compareFractions(beat, score.lengthBeats) > 0
    ) {
      throw new RangeError("Beat is outside the score");
    }
    if (compareFractions(beat, score.lengthBeats) === 0) return currentTimeSec;
    const segment = segments.find(
      (candidate) =>
        compareFractions(beat, candidate.startBeat) >= 0 &&
        compareFractions(beat, candidate.endBeat) < 0,
    );
    if (segment === undefined)
      throw new RangeError("No tempo segment contains the beat");
    return (
      segment.startTimeSec +
      (fractionToNumber(subtractFractions(beat, segment.startBeat)) * 60) /
        segment.bpm
    );
  };

  const secondsToBeatPosition = (seconds: number): number => {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > currentTimeSec) {
      throw new RangeError("Time is outside the score");
    }
    if (seconds === currentTimeSec) return fractionToNumber(score.lengthBeats);
    const segment = segments.find(
      (candidate) =>
        seconds >= candidate.startTimeSec && seconds < candidate.endTimeSec,
    );
    if (segment === undefined)
      throw new RangeError("No tempo segment contains the time");
    return (
      fractionToNumber(segment.startBeat) +
      ((seconds - segment.startTimeSec) * segment.bpm) / 60
    );
  };

  return {
    segments,
    durationSec: currentTimeSec,
    beatToSeconds,
    secondsToBeatPosition,
  };
}

export function addSubdivision(
  start: Fraction,
  subdivision: Fraction,
  count: number,
): Fraction {
  return addFractions(start, multiplyFractions(subdivision, fraction(count)));
}
