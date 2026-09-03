export interface WaveformOverview {
  sampleRate: number;
  frameCount: number;
  bucketSize: number;
  minimums: Float32Array;
  maximums: Float32Array;
}

export function buildWaveformOverview(
  samples: Float32Array,
  sampleRate: number,
  maximumBuckets = 4096,
): WaveformOverview {
  if (
    !(sampleRate > 0) ||
    !Number.isInteger(maximumBuckets) ||
    maximumBuckets < 1
  ) {
    throw new Error(
      "Waveform overview requires a positive sample rate and bucket count",
    );
  }
  const bucketSize = Math.max(1, Math.ceil(samples.length / maximumBuckets));
  const bucketCount = Math.ceil(samples.length / bucketSize);
  const minimums = new Float32Array(bucketCount);
  const maximums = new Float32Array(bucketCount);
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    let minimum = 0;
    let maximum = 0;
    for (let index = start; index < end; index += 1) {
      minimum = Math.min(minimum, samples[index]!);
      maximum = Math.max(maximum, samples[index]!);
    }
    minimums[bucket] = minimum;
    maximums[bucket] = maximum;
  }
  return {
    sampleRate,
    frameCount: samples.length,
    bucketSize,
    minimums,
    maximums,
  };
}
