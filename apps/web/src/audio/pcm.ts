import type {
  AudioSourceInfo,
  PcmRecording,
  RecordingMetadata,
} from "../domain";

const DB_FLOOR = -160;

export function concatenatePcmChunks(
  chunks: readonly Float32Array[],
): Float32Array {
  const frameCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(frameCount);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function pcmLevelStatistics(
  samples: Float32Array,
  clippingAmplitude: number,
): Pick<RecordingMetadata, "clippingSampleRatio" | "peakAbs" | "rmsDbfs"> {
  if (!(clippingAmplitude > 0 && clippingAmplitude <= 1)) {
    throw new Error("clippingAmplitude must be in (0, 1]");
  }
  if (samples.length === 0) {
    return { clippingSampleRatio: 0, peakAbs: 0, rmsDbfs: DB_FLOOR };
  }
  let peakAbs = 0;
  let squaredSum = 0;
  let clipped = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    peakAbs = Math.max(peakAbs, absolute);
    squaredSum += sample * sample;
    if (absolute >= clippingAmplitude) clipped += 1;
  }
  const rms = Math.sqrt(squaredSum / samples.length);
  return {
    clippingSampleRatio: clipped / samples.length,
    peakAbs,
    rmsDbfs: Math.max(
      DB_FLOOR,
      Math.min(0, 20 * Math.log10(Math.max(rms, 1e-8))),
    ),
  };
}

export function createPcmRecording(
  samples: Float32Array,
  info: AudioSourceInfo,
  startedAt: string,
  nearClippingThresholdDbfs: number,
): PcmRecording {
  const clippingAmplitude = 10 ** (nearClippingThresholdDbfs / 20);
  return {
    samples,
    metadata: {
      schemaVersion: "1.0",
      sampleRate: info.sampleRate,
      channelCount: info.channelCount,
      frameCount: samples.length,
      durationSec: samples.length / info.sampleRate,
      requestedConstraints: { ...info.requestedConstraints },
      appliedSettings: { ...info.appliedSettings },
      ...pcmLevelStatistics(samples, clippingAmplitude),
      startedAt,
    },
  };
}
