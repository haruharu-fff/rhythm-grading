import type { DetectedStroke, OnsetDetectorConfig } from "../domain";

export interface OnsetWorkerRequest {
  type: "detect";
  requestId: number;
  samples: Float32Array;
  sampleRate: number;
  config: OnsetDetectorConfig;
}

export type OnsetWorkerResponse =
  | {
      type: "result";
      requestId: number;
      strokes: DetectedStroke[];
      candidateSamples: number[];
      refinedSamples: number[];
    }
  | { type: "error"; requestId: number; message: string };
