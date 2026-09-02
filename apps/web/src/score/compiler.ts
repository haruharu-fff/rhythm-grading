import type {
  DynamicRegion,
  RollRegion,
  ScoreDocument,
  TargetDynamicRegion,
  TargetPerformance,
  TargetRegion,
  TargetRollRegion,
  TargetStroke,
} from "../domain";
import { compareFractions, fractionKey } from "./fraction";
import { addSubdivision, compileTempoMap } from "./tempo-map";
import { ScoreValidationError, validateScoreDocument } from "./validation";

export interface ScoreCompiler {
  compile(score: ScoreDocument): TargetPerformance;
}

function compareRegions(
  left: RollRegion | DynamicRegion,
  right: RollRegion | DynamicRegion,
): number {
  const byStart = compareFractions(left.startBeat, right.startBeat);
  if (byStart !== 0) return byStart;
  const byEnd = compareFractions(left.endBeat, right.endBeat);
  return byEnd !== 0 ? byEnd : left.id.localeCompare(right.id);
}

export class DefaultScoreCompiler implements ScoreCompiler {
  compile(input: ScoreDocument): TargetPerformance {
    const validation = validateScoreDocument(input);
    if (!validation.valid) throw new ScoreValidationError(validation.issues);
    const score = validation.value;
    const tempoMap = compileTempoMap(score);
    const strokes: TargetStroke[] = score.strokes.map((stroke) => ({
      id: `stroke:${stroke.id}`,
      sourceStrokeId: stroke.id,
      beat: stroke.beat,
      timeSec: tempoMap.beatToSeconds(stroke.beat),
      hand: stroke.hand,
      accent: stroke.accent,
      ...(stroke.targetDynamic === undefined
        ? {}
        : { targetDynamic: stroke.targetDynamic }),
      origin: "stroke",
    }));
    const explicitBeatKeys = new Set(
      score.strokes.map((stroke) => fractionKey(stroke.beat)),
    );
    const generatedBeatKeys = new Set<string>();
    const regions: TargetRegion[] = [];

    for (const region of [...score.regions].sort(compareRegions)) {
      const common = {
        id: `region:${region.id}`,
        sourceRegionId: region.id,
        startBeat: region.startBeat,
        endBeat: region.endBeat,
        startTimeSec: tempoMap.beatToSeconds(region.startBeat),
        endTimeSec: tempoMap.beatToSeconds(region.endBeat),
      };
      if (region.type === "roll") {
        const targetRegion: TargetRollRegion = {
          ...common,
          type: "roll",
          mode: region.mode,
          ...(region.subdivision === undefined
            ? {}
            : { subdivision: region.subdivision }),
          ...(region.targetDensityHz === undefined
            ? {}
            : { targetDensityHz: region.targetDensityHz }),
        };
        regions.push(targetRegion);
        if (region.mode === "measured" && region.subdivision !== undefined) {
          for (let index = 0; ; index += 1) {
            const beat = addSubdivision(
              region.startBeat,
              region.subdivision,
              index,
            );
            if (compareFractions(beat, region.endBeat) >= 0) break;
            const key = fractionKey(beat);
            if (explicitBeatKeys.has(key) || generatedBeatKeys.has(key))
              continue;
            generatedBeatKeys.add(key);
            strokes.push({
              id: `roll:${region.id}:${key}`,
              sourceRegionId: region.id,
              beat,
              timeSec: tempoMap.beatToSeconds(beat),
              hand: "unspecified",
              accent: false,
              origin: "measured-roll",
            });
          }
        }
      } else {
        const targetRegion: TargetDynamicRegion = {
          ...common,
          type: region.type,
          curve: region.curve,
          ...(region.startLevel === undefined
            ? {}
            : { startLevel: region.startLevel }),
          ...(region.endLevel === undefined
            ? {}
            : { endLevel: region.endLevel }),
        };
        regions.push(targetRegion);
      }
    }
    strokes.sort(
      (left, right) =>
        left.timeSec - right.timeSec || left.id.localeCompare(right.id),
    );
    regions.sort(
      (left, right) =>
        left.startTimeSec - right.startTimeSec ||
        left.endTimeSec - right.endTimeSec ||
        left.id.localeCompare(right.id),
    );
    return {
      scoreId: score.id,
      durationSec: tempoMap.durationSec,
      strokes,
      regions,
      tempoMap: tempoMap.segments,
    };
  }
}

export const scoreCompiler: ScoreCompiler = new DefaultScoreCompiler();
