import type {
  AudioConstraintSnapshot,
  AudioSettingSnapshot,
  AudioSource,
  AudioSourceInfo,
  PcmRecording,
  RecordingState,
} from "../domain";
import { concatenatePcmChunks, createPcmRecording } from "./pcm";

const WORKLET_NAME = "pcm-recorder";
const STOP_ACK_TIMEOUT_MS = 2_000;

const REQUESTED_CONSTRAINTS: Readonly<AudioConstraintSnapshot> = {
  channelCount: 1,
  sampleRate: 48_000,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

interface BrowserAudioDependencies {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudioContext(): AudioContext;
  createWorkletNode(context: AudioContext, name: string): AudioWorkletNode;
  moduleUrl: string;
  now(): Date;
}

export class BrowserAudioError extends Error {
  constructor(
    public readonly code:
      | "unsupported"
      | "permission-denied"
      | "device-unavailable"
      | "invalid-state"
      | "worklet-failed"
      | "capture-failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserAudioError";
  }
}

function defaultDependencies(): BrowserAudioDependencies {
  if (
    typeof navigator === "undefined" ||
    navigator.mediaDevices?.getUserMedia === undefined ||
    typeof AudioContext === "undefined"
  ) {
    throw new BrowserAudioError(
      "unsupported",
      "This browser does not provide the required Web Audio recording APIs.",
    );
  }
  return {
    getUserMedia: (constraints) =>
      navigator.mediaDevices.getUserMedia(constraints),
    createAudioContext: () => new AudioContext({ latencyHint: "interactive" }),
    createWorkletNode: (context, name) =>
      new AudioWorkletNode(context, name, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
      }),
    moduleUrl: new URL("pcm-recorder.worklet.js", document.baseURI).href,
    now: () => new Date(),
  };
}

function snapshotAppliedSettings(
  settings: MediaTrackSettings,
  sampleRate: number,
): AudioSettingSnapshot {
  return {
    sampleRate,
    channelCount: settings.channelCount,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
    deviceId: settings.deviceId,
  };
}

function audioError(error: unknown): BrowserAudioError {
  if (error instanceof BrowserAudioError) return error;
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return new BrowserAudioError(
      "permission-denied",
      "Microphone access was denied. Allow microphone access and try again.",
      { cause: error },
    );
  }
  if (
    error instanceof DOMException &&
    ["NotFoundError", "NotReadableError", "OverconstrainedError"].includes(
      error.name,
    )
  ) {
    return new BrowserAudioError(
      "device-unavailable",
      "No usable microphone is available. Check the selected input device.",
      { cause: error },
    );
  }
  return new BrowserAudioError(
    "capture-failed",
    "Microphone capture failed. Release the device in other applications and retry.",
    { cause: error },
  );
}

export class BrowserAudioSource implements AudioSource {
  private readonly dependencies: BrowserAudioDependencies;
  private readonly nearClippingThresholdDbfs: number;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private mediaNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private sourceInfo: AudioSourceInfo | null = null;
  private startedAt: string | null = null;
  private stopAcknowledgement: (() => void) | null = null;
  state: RecordingState = "idle";

  constructor(
    nearClippingThresholdDbfs: number,
    dependencies?: BrowserAudioDependencies,
  ) {
    this.nearClippingThresholdDbfs = nearClippingThresholdDbfs;
    this.dependencies = dependencies ?? defaultDependencies();
  }

  async prepare(): Promise<AudioSourceInfo> {
    if (!["idle", "completed", "error"].includes(this.state)) {
      throw new BrowserAudioError(
        "invalid-state",
        `Cannot prepare audio capture while state is ${this.state}.`,
      );
    }
    await this.releaseResources();
    this.state = "requesting-permission";
    try {
      this.stream = await this.dependencies.getUserMedia({
        audio: {
          channelCount: { ideal: REQUESTED_CONSTRAINTS.channelCount },
          sampleRate: { ideal: REQUESTED_CONSTRAINTS.sampleRate },
          echoCancellation: REQUESTED_CONSTRAINTS.echoCancellation,
          noiseSuppression: REQUESTED_CONSTRAINTS.noiseSuppression,
          autoGainControl: REQUESTED_CONSTRAINTS.autoGainControl,
        },
      });
      const track = this.stream.getAudioTracks()[0];
      if (track === undefined) {
        throw new BrowserAudioError(
          "device-unavailable",
          "The selected stream did not contain an audio track.",
        );
      }
      this.context = this.dependencies.createAudioContext();
      if (this.context.audioWorklet === undefined) {
        throw new BrowserAudioError(
          "unsupported",
          "AudioWorklet is unavailable in this browser.",
        );
      }
      await this.context.audioWorklet.addModule(this.dependencies.moduleUrl);
      if (this.context.state === "suspended") await this.context.resume();
      this.mediaNode = this.context.createMediaStreamSource(this.stream);
      this.workletNode = this.dependencies.createWorkletNode(
        this.context,
        WORKLET_NAME,
      );
      this.silentGain = this.context.createGain();
      this.silentGain.gain.value = 0;
      this.mediaNode.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
      this.silentGain.connect(this.context.destination);
      this.workletNode.port.onmessage = (event: MessageEvent<unknown>) => {
        this.handleWorkletMessage(event.data);
      };
      const settings = track.getSettings();
      this.sourceInfo = {
        sampleRate: this.context.sampleRate,
        channelCount: 1,
        requestedConstraints: { ...REQUESTED_CONSTRAINTS },
        appliedSettings: snapshotAppliedSettings(
          settings,
          this.context.sampleRate,
        ),
      };
      this.state = "ready";
      return this.sourceInfo;
    } catch (error) {
      this.state = "error";
      await this.releaseResources();
      throw audioError(error);
    }
  }

  start(): Promise<void> {
    if (this.state !== "ready" || this.workletNode === null) {
      return Promise.reject(
        new BrowserAudioError(
          "invalid-state",
          `Cannot start audio capture while state is ${this.state}.`,
        ),
      );
    }
    this.chunks = [];
    this.startedAt = this.dependencies.now().toISOString();
    this.workletNode.port.postMessage({ type: "start" });
    this.state = "recording";
    return Promise.resolve();
  }

  async stop(): Promise<PcmRecording> {
    if (
      this.state !== "recording" ||
      this.workletNode === null ||
      this.sourceInfo === null ||
      this.startedAt === null
    ) {
      throw new BrowserAudioError(
        "invalid-state",
        `Cannot stop audio capture while state is ${this.state}.`,
      );
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => {
          this.stopAcknowledgement = null;
          reject(
            new BrowserAudioError(
              "worklet-failed",
              "The audio collector did not finish cleanly.",
            ),
          );
        }, STOP_ACK_TIMEOUT_MS);
        this.stopAcknowledgement = () => {
          globalThis.clearTimeout(timeout);
          resolve();
        };
        this.workletNode!.port.postMessage({ type: "stop" });
      });
      const recording = createPcmRecording(
        concatenatePcmChunks(this.chunks),
        this.sourceInfo,
        this.startedAt,
        this.nearClippingThresholdDbfs,
      );
      this.state = "completed";
      return recording;
    } catch (error) {
      this.state = "error";
      throw audioError(error);
    } finally {
      await this.releaseResources();
    }
  }

  async dispose(): Promise<void> {
    await this.releaseResources();
    this.state = "idle";
  }

  private handleWorkletMessage(data: unknown): void {
    if (typeof data !== "object" || data === null || !("type" in data)) return;
    if (
      data.type === "chunk" &&
      "buffer" in data &&
      data.buffer instanceof ArrayBuffer
    ) {
      this.chunks.push(new Float32Array(data.buffer));
    } else if (data.type === "stopped") {
      this.stopAcknowledgement?.();
      this.stopAcknowledgement = null;
    }
  }

  private async releaseResources(): Promise<void> {
    this.stopAcknowledgement = null;
    if (this.workletNode !== null) this.workletNode.port.onmessage = null;
    for (const node of [this.mediaNode, this.workletNode, this.silentGain]) {
      try {
        node?.disconnect();
      } catch {
        // A partially prepared graph may already be disconnected.
      }
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    const context = this.context;
    this.stream = null;
    this.context = null;
    this.mediaNode = null;
    this.workletNode = null;
    this.silentGain = null;
    this.sourceInfo = null;
    this.startedAt = null;
    if (context !== null && context.state !== "closed") await context.close();
  }
}
