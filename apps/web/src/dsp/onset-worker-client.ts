import type { DetectedStroke, OnsetDetectorConfig } from "../domain";
import type {
  OnsetWorkerRequest,
  OnsetWorkerResponse,
} from "../workers/onset-detector-protocol";

export interface OfflineOnsetDetector {
  detect(
    samples: Float32Array,
    sampleRate: number,
    config: OnsetDetectorConfig,
  ): Promise<DetectedStroke[]>;
  dispose(): void;
}

type WorkerFactory = () => Worker;

interface PendingRequest {
  resolve(strokes: DetectedStroke[]): void;
  reject(error: Error): void;
}

export class OnsetWorkerClient implements OfflineOnsetDetector {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;

  constructor(
    workerFactory: WorkerFactory = () =>
      new Worker(
        new URL("../workers/onset-detector.worker.ts", import.meta.url),
        {
          type: "module",
        },
      ),
  ) {
    this.worker = workerFactory();
    this.worker.onmessage = (event: MessageEvent<OnsetWorkerResponse>) => {
      this.handleResponse(event.data);
    };
    this.worker.onerror = (event) => {
      this.rejectAll(
        new Error(event.message || "Onset detector Worker failed"),
      );
    };
  }

  detect(
    samples: Float32Array,
    sampleRate: number,
    config: OnsetDetectorConfig,
  ): Promise<DetectedStroke[]> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      const request: OnsetWorkerRequest = {
        type: "detect",
        requestId,
        samples,
        sampleRate,
        config,
      };
      this.worker.postMessage(request, [samples.buffer]);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.rejectAll(new Error("Onset detector Worker was disposed"));
  }

  private handleResponse(response: OnsetWorkerResponse): void {
    const request = this.pending.get(response.requestId);
    if (request === undefined) return;
    this.pending.delete(response.requestId);
    if (response.type === "result") request.resolve(response.strokes);
    else request.reject(new Error(response.message));
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
