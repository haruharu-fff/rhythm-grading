import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config";
import { OnsetWorkerClient } from "../src/dsp";
import type {
  OnsetWorkerRequest,
  OnsetWorkerResponse,
} from "../src/workers/onset-detector-protocol";

describe("OnsetWorkerClient", () => {
  it("uses a transferable PCM buffer and resolves the matching response", async () => {
    let transferred: Transferable[] = [];
    const worker = {
      onmessage: null as
        ((event: MessageEvent<OnsetWorkerResponse>) => void) | null,
      onerror: null,
      postMessage: (request: OnsetWorkerRequest, transfer: Transferable[]) => {
        transferred = transfer;
        worker.onmessage?.({
          data: {
            type: "result",
            requestId: request.requestId,
            strokes: [],
            candidateSamples: [],
            refinedSamples: [],
          },
        } as unknown as MessageEvent<OnsetWorkerResponse>);
      },
      terminate: () => undefined,
    };
    const client = new OnsetWorkerClient(() => worker as unknown as Worker);
    const samples = new Float32Array(32);

    await expect(
      client.detect(samples, 48_000, DEFAULT_ANALYSIS_CONFIG.onset),
    ).resolves.toEqual([]);
    expect(transferred).toEqual([samples.buffer]);
    client.dispose();
  });
});
