/// <reference lib="webworker" />

import { detectOnsets } from "../dsp/onset-detector";
import type {
  OnsetWorkerRequest,
  OnsetWorkerResponse,
} from "./onset-detector-protocol";

const workerScope: DedicatedWorkerGlobalScope =
  self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<OnsetWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "detect") return;
  try {
    const result = detectOnsets(
      request.samples,
      request.sampleRate,
      request.config,
    );
    const response: OnsetWorkerResponse = {
      type: "result",
      requestId: request.requestId,
      strokes: result.strokes,
      candidateSamples: result.diagnostics.candidateSamples,
      refinedSamples: result.diagnostics.refinedSamples,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: OnsetWorkerResponse = {
      type: "error",
      requestId: request.requestId,
      message:
        error instanceof Error ? error.message : "Unknown detector error",
    };
    workerScope.postMessage(response);
  }
};

export {};
