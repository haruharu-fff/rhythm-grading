import { readFileSync } from "node:fs";

export interface DecodedWav {
  sampleRate: number;
  samples: Float32Array;
}

export function decodeMonoPcm16Wav(path: string): DecodedWav {
  const file = readFileSync(path);
  if (
    file.toString("ascii", 0, 4) !== "RIFF" ||
    file.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Expected a RIFF/WAVE file");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let data: Buffer | null = null;
  while (offset + 8 <= file.length) {
    const id = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      audioFormat = file.readUInt16LE(start);
      channels = file.readUInt16LE(start + 2);
      sampleRate = file.readUInt32LE(start + 4);
      bitsPerSample = file.readUInt16LE(start + 14);
    } else if (id === "data") {
      data = file.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (
    data === null ||
    audioFormat !== 1 ||
    channels !== 1 ||
    bitsPerSample !== 16 ||
    sampleRate <= 0
  ) {
    throw new Error("Expected mono 16-bit PCM WAV data");
  }
  const samples = new Float32Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = data.readInt16LE(index * 2) / 32768;
  }
  return { sampleRate, samples };
}
