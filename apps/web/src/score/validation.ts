import type {
  DynamicRegion,
  EditorMetadata,
  Fraction,
  RollRegion,
  ScoreDocument,
  ScoreRegion,
  ScoreStroke,
  TempoChange,
  TimeSignatureChange,
} from "../domain";
import { compareFractions, fractionKey, normalizeFraction } from "./fraction";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ScoreValidationResult =
  | { valid: true; value: ScoreDocument; issues: [] }
  | { valid: false; value: null; issues: ValidationIssue[] };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  issues: ValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message });
}

function readString(
  record: JsonRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    issue(
      issues,
      `${path}.${key}`,
      "invalid-string",
      "Expected a non-empty string",
    );
    return null;
  }
  return value;
}

function readFiniteNumber(
  record: JsonRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | null {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issue(
      issues,
      `${path}.${key}`,
      "invalid-number",
      "Expected a finite number",
    );
    return null;
  }
  return value;
}

function readFraction(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Fraction | null {
  if (!isRecord(value)) {
    issue(issues, path, "invalid-fraction", "Expected a Fraction object");
    return null;
  }
  const numerator = value.numerator;
  const denominator = value.denominator;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    issue(
      issues,
      path,
      "unsafe-fraction",
      "Fraction components must be safe integers",
    );
    return null;
  }
  try {
    return normalizeFraction({
      numerator: numerator as number,
      denominator: denominator as number,
    });
  } catch (error) {
    issue(
      issues,
      path,
      "invalid-fraction",
      error instanceof Error ? error.message : "Invalid Fraction",
    );
    return null;
  }
}

function readOptionalUnitNumber(
  record: JsonRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    issue(
      issues,
      `${path}.${key}`,
      "out-of-range",
      "Expected a number between 0 and 1",
    );
    return undefined;
  }
  return value;
}

function parseStroke(
  value: unknown,
  index: number,
  issues: ValidationIssue[],
): ScoreStroke | null {
  const path = `$.strokes[${index}]`;
  if (!isRecord(value)) {
    issue(issues, path, "invalid-stroke", "Expected a stroke object");
    return null;
  }
  const id = readString(value, "id", path, issues);
  const beat = readFraction(value.beat, `${path}.beat`, issues);
  const hand = value.hand;
  const accent = value.accent;
  if (hand !== "R" && hand !== "L" && hand !== "unspecified") {
    issue(
      issues,
      `${path}.hand`,
      "invalid-hand",
      "Expected R, L, or unspecified",
    );
  }
  if (typeof accent !== "boolean") {
    issue(issues, `${path}.accent`, "invalid-boolean", "Expected a boolean");
  }
  const targetDynamic = readOptionalUnitNumber(
    value,
    "targetDynamic",
    path,
    issues,
  );
  let tags: string[] | undefined;
  if (value.tags !== undefined) {
    if (
      !Array.isArray(value.tags) ||
      !value.tags.every((tag) => typeof tag === "string")
    ) {
      issue(
        issues,
        `${path}.tags`,
        "invalid-tags",
        "Expected an array of strings",
      );
    } else {
      tags = [...value.tags];
    }
  }
  if (
    id === null ||
    beat === null ||
    (hand !== "R" && hand !== "L" && hand !== "unspecified") ||
    typeof accent !== "boolean"
  ) {
    return null;
  }
  return {
    id,
    beat,
    hand,
    accent,
    ...(targetDynamic === undefined ? {} : { targetDynamic }),
    ...(tags === undefined ? {} : { tags }),
  };
}

function parseRegion(
  value: unknown,
  index: number,
  issues: ValidationIssue[],
): ScoreRegion | null {
  const path = `$.regions[${index}]`;
  if (!isRecord(value)) {
    issue(issues, path, "invalid-region", "Expected a region object");
    return null;
  }
  const id = readString(value, "id", path, issues);
  const startBeat = readFraction(value.startBeat, `${path}.startBeat`, issues);
  const endBeat = readFraction(value.endBeat, `${path}.endBeat`, issues);
  if (value.type === "roll") {
    if (value.mode !== "measured" && value.mode !== "unmeasured") {
      issue(
        issues,
        `${path}.mode`,
        "invalid-roll-mode",
        "Expected measured or unmeasured",
      );
      return null;
    }
    const subdivision =
      value.subdivision === undefined
        ? undefined
        : (readFraction(value.subdivision, `${path}.subdivision`, issues) ??
          undefined);
    const targetDensityHz = value.targetDensityHz;
    if (
      targetDensityHz !== undefined &&
      (typeof targetDensityHz !== "number" ||
        !Number.isFinite(targetDensityHz) ||
        targetDensityHz <= 0)
    ) {
      issue(
        issues,
        `${path}.targetDensityHz`,
        "invalid-density",
        "Density must be positive",
      );
    }
    if (value.mode === "measured" && subdivision === undefined) {
      issue(
        issues,
        `${path}.subdivision`,
        "required",
        "Measured rolls require a subdivision",
      );
    }
    if (
      subdivision !== undefined &&
      compareFractions(subdivision, { numerator: 0, denominator: 1 }) <= 0
    ) {
      issue(
        issues,
        `${path}.subdivision`,
        "out-of-range",
        "Subdivision must be positive",
      );
    }
    if (id === null || startBeat === null || endBeat === null) return null;
    const region: RollRegion = {
      id,
      type: "roll",
      mode: value.mode,
      startBeat,
      endBeat,
      ...(subdivision === undefined ? {} : { subdivision }),
      ...(typeof targetDensityHz === "number" &&
      Number.isFinite(targetDensityHz) &&
      targetDensityHz > 0
        ? { targetDensityHz }
        : {}),
    };
    return region;
  }
  if (value.type === "crescendo" || value.type === "decrescendo") {
    if (
      value.curve !== "linear" &&
      value.curve !== "ease-in" &&
      value.curve !== "ease-out"
    ) {
      issue(
        issues,
        `${path}.curve`,
        "invalid-curve",
        "Expected linear, ease-in, or ease-out",
      );
      return null;
    }
    const startLevel = readOptionalUnitNumber(
      value,
      "startLevel",
      path,
      issues,
    );
    const endLevel = readOptionalUnitNumber(value, "endLevel", path, issues);
    if (id === null || startBeat === null || endBeat === null) return null;
    const region: DynamicRegion = {
      id,
      type: value.type,
      curve: value.curve,
      startBeat,
      endBeat,
      ...(startLevel === undefined ? {} : { startLevel }),
      ...(endLevel === undefined ? {} : { endLevel }),
    };
    return region;
  }
  issue(
    issues,
    `${path}.type`,
    "invalid-region-type",
    "Expected roll, crescendo, or decrescendo",
  );
  return null;
}

function parseEditor(
  value: unknown,
  issues: ValidationIssue[],
): EditorMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issue(
      issues,
      "$.editor",
      "invalid-editor",
      "Expected editor metadata object",
    );
    return undefined;
  }
  const editor: EditorMetadata = {};
  if (value.gridDivision !== undefined) {
    if (
      !Number.isSafeInteger(value.gridDivision) ||
      (value.gridDivision as number) <= 0
    )
      issue(
        issues,
        "$.editor.gridDivision",
        "invalid-grid",
        "Grid division must be a positive integer",
      );
    else editor.gridDivision = value.gridDivision as number;
  }
  if (value.snapEnabled !== undefined) {
    if (typeof value.snapEnabled !== "boolean")
      issue(
        issues,
        "$.editor.snapEnabled",
        "invalid-boolean",
        "Expected a boolean",
      );
    else editor.snapEnabled = value.snapEnabled;
  }
  if (value.viewportStartBeat !== undefined)
    editor.viewportStartBeat =
      readFraction(
        value.viewportStartBeat,
        "$.editor.viewportStartBeat",
        issues,
      ) ?? undefined;
  if (value.viewportEndBeat !== undefined)
    editor.viewportEndBeat =
      readFraction(value.viewportEndBeat, "$.editor.viewportEndBeat", issues) ??
      undefined;
  return editor;
}

export function validateScoreDocument(input: unknown): ScoreValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      valid: false,
      value: null,
      issues: [
        { path: "$", code: "invalid-document", message: "Expected an object" },
      ],
    };
  }
  if (input.schemaVersion !== "1.0")
    issue(
      issues,
      "$.schemaVersion",
      "unsupported-schema",
      "Expected schemaVersion 1.0",
    );
  const id = readString(input, "id", "$", issues);
  const title = readString(input, "title", "$", issues);
  const createdAt = readString(input, "createdAt", "$", issues);
  const updatedAt = readString(input, "updatedAt", "$", issues);
  const lengthBeats = readFraction(input.lengthBeats, "$.lengthBeats", issues);
  const initialTempoBpm = readFiniteNumber(
    input,
    "initialTempoBpm",
    "$",
    issues,
  );
  if (
    lengthBeats !== null &&
    compareFractions(lengthBeats, { numerator: 0, denominator: 1 }) <= 0
  )
    issue(
      issues,
      "$.lengthBeats",
      "out-of-range",
      "Score length must be positive",
    );
  if (initialTempoBpm !== null && initialTempoBpm <= 0)
    issue(
      issues,
      "$.initialTempoBpm",
      "out-of-range",
      "Tempo must be positive",
    );

  const tempoChanges: TempoChange[] = [];
  if (!Array.isArray(input.tempoChanges))
    issue(issues, "$.tempoChanges", "invalid-array", "Expected an array");
  else
    input.tempoChanges.forEach((value, index) => {
      const path = `$.tempoChanges[${index}]`;
      if (!isRecord(value))
        return issue(
          issues,
          path,
          "invalid-tempo-change",
          "Expected an object",
        );
      const beat = readFraction(value.beat, `${path}.beat`, issues);
      const bpm = readFiniteNumber(value, "bpm", path, issues);
      if (bpm !== null && bpm <= 0)
        issue(issues, `${path}.bpm`, "out-of-range", "Tempo must be positive");
      if (beat !== null && bpm !== null && bpm > 0)
        tempoChanges.push({ beat, bpm });
    });

  const timeSignatures: TimeSignatureChange[] = [];
  const allowedDenominators = new Set([1, 2, 4, 8, 16]);
  if (!Array.isArray(input.timeSignatures))
    issue(issues, "$.timeSignatures", "invalid-array", "Expected an array");
  else
    input.timeSignatures.forEach((value, index) => {
      const path = `$.timeSignatures[${index}]`;
      if (!isRecord(value))
        return issue(
          issues,
          path,
          "invalid-time-signature",
          "Expected an object",
        );
      const beat = readFraction(value.beat, `${path}.beat`, issues);
      const numerator = value.numerator;
      const denominator = value.denominator;
      if (!Number.isSafeInteger(numerator) || (numerator as number) <= 0)
        issue(
          issues,
          `${path}.numerator`,
          "invalid-numerator",
          "Numerator must be a positive integer",
        );
      if (
        !Number.isSafeInteger(denominator) ||
        !allowedDenominators.has(denominator as number)
      )
        issue(
          issues,
          `${path}.denominator`,
          "invalid-denominator",
          "Unsupported denominator",
        );
      if (
        beat !== null &&
        Number.isSafeInteger(numerator) &&
        (numerator as number) > 0 &&
        Number.isSafeInteger(denominator) &&
        allowedDenominators.has(denominator as number)
      ) {
        timeSignatures.push({
          beat,
          numerator: numerator as number,
          denominator: denominator as 1 | 2 | 4 | 8 | 16,
        });
      }
    });

  const strokes: ScoreStroke[] = [];
  if (!Array.isArray(input.strokes))
    issue(issues, "$.strokes", "invalid-array", "Expected an array");
  else
    input.strokes.forEach((value, index) => {
      const stroke = parseStroke(value, index, issues);
      if (stroke !== null) strokes.push(stroke);
    });
  const regions: ScoreRegion[] = [];
  if (!Array.isArray(input.regions))
    issue(issues, "$.regions", "invalid-array", "Expected an array");
  else
    input.regions.forEach((value, index) => {
      const region = parseRegion(value, index, issues);
      if (region !== null) regions.push(region);
    });
  const editor = parseEditor(input.editor, issues);

  const duplicateCheck = (values: string[], path: string): void => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value))
        issue(issues, path, "duplicate-id", `Duplicate id: ${value}`);
      seen.add(value);
    }
  };
  duplicateCheck(
    strokes.map((stroke) => stroke.id),
    "$.strokes",
  );
  duplicateCheck(
    regions.map((region) => region.id),
    "$.regions",
  );

  if (lengthBeats !== null) {
    const inStrokeRange = (beat: Fraction): boolean =>
      compareFractions(beat, { numerator: 0, denominator: 1 }) >= 0 &&
      compareFractions(beat, lengthBeats) < 0;
    strokes.forEach((stroke) => {
      if (!inStrokeRange(stroke.beat))
        issue(
          issues,
          `$.strokes.${stroke.id}.beat`,
          "out-of-range",
          "Stroke beat must be inside the score",
        );
    });
    [...tempoChanges, ...timeSignatures].forEach((change) => {
      if (!inStrokeRange(change.beat))
        issue(
          issues,
          "$.tempoChanges/timeSignatures",
          "out-of-range",
          "Change beat must be inside the score",
        );
    });
    regions.forEach((region) => {
      if (
        compareFractions(region.startBeat, { numerator: 0, denominator: 1 }) <
          0 ||
        compareFractions(region.endBeat, lengthBeats) > 0
      )
        issue(
          issues,
          `$.regions.${region.id}`,
          "out-of-range",
          "Region must be inside the score",
        );
      if (compareFractions(region.endBeat, region.startBeat) <= 0)
        issue(
          issues,
          `$.regions.${region.id}`,
          "invalid-range",
          "Region end must be after start",
        );
    });
  }
  const tempoBeatKeys = new Set<string>();
  tempoChanges.forEach((change) => {
    const key = fractionKey(change.beat);
    if (tempoBeatKeys.has(key))
      issue(
        issues,
        "$.tempoChanges",
        "duplicate-tempo-beat",
        `Multiple tempo changes at ${key}`,
      );
    tempoBeatKeys.add(key);
  });
  const dynamicRegions = regions.filter(
    (region): region is DynamicRegion => region.type !== "roll",
  );
  for (let i = 0; i < dynamicRegions.length; i += 1) {
    for (let j = i + 1; j < dynamicRegions.length; j += 1) {
      const left = dynamicRegions[i];
      const right = dynamicRegions[j];
      if (left === undefined || right === undefined || left.type === right.type)
        continue;
      const overlaps =
        compareFractions(left.startBeat, right.endBeat) < 0 &&
        compareFractions(right.startBeat, left.endBeat) < 0;
      if (overlaps)
        issue(
          issues,
          "$.regions",
          "conflicting-dynamics",
          `Opposing dynamic regions ${left.id} and ${right.id} overlap`,
        );
    }
  }

  if (
    issues.length > 0 ||
    id === null ||
    title === null ||
    createdAt === null ||
    updatedAt === null ||
    lengthBeats === null ||
    initialTempoBpm === null
  ) {
    return { valid: false, value: null, issues };
  }
  return {
    valid: true,
    issues: [],
    value: {
      schemaVersion: "1.0",
      id,
      title,
      createdAt,
      updatedAt,
      lengthBeats,
      initialTempoBpm,
      tempoChanges,
      timeSignatures,
      strokes,
      regions,
      ...(editor === undefined ? {} : { editor }),
    },
  };
}

export class ScoreValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super(
      `Invalid ScoreDocument (${issues.length} issue${issues.length === 1 ? "" : "s"})`,
    );
    this.name = "ScoreValidationError";
  }
}
