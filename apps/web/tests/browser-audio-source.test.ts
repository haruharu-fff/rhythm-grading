import { describe, expect, it } from "vitest";
import { BrowserAudioSource } from "../src/audio";

describe("BrowserAudioSource", () => {
  it("collects transferable chunks and releases stream, graph, and context on stop", async () => {
    const disconnects: string[] = [];
    let trackStopped = false;
    let contextClosed = false;
    const node = (name: string) => ({
      connect: () => undefined,
      disconnect: () => disconnects.push(name),
    });
    const mediaNode = node("media");
    const silentGain = { ...node("gain"), gain: { value: 1 } };
    const port = {
      onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
      postMessage: (message: { type: string }) => {
        if (message.type === "stop") {
          const samples = Float32Array.of(0.1, -0.2, 0.3);
          port.onmessage?.({
            data: { type: "chunk", buffer: samples.buffer },
          } as MessageEvent);
          port.onmessage?.({ data: { type: "stopped" } } as MessageEvent);
        }
      },
    };
    const workletNode = { ...node("worklet"), port };
    const track = {
      stop: () => {
        trackStopped = true;
      },
      getSettings: () => ({
        channelCount: 1,
        autoGainControl: false,
        noiseSuppression: false,
        echoCancellation: false,
      }),
    };
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
    const context = {
      sampleRate: 48_000,
      state: "running",
      audioWorklet: { addModule: () => Promise.resolve() },
      createMediaStreamSource: () => mediaNode,
      createGain: () => silentGain,
      destination: node("destination"),
      resume: () => Promise.resolve(),
      close: () => {
        contextClosed = true;
        return Promise.resolve();
      },
    };
    const source = new BrowserAudioSource(-0.25, {
      getUserMedia: () => Promise.resolve(stream as unknown as MediaStream),
      createAudioContext: () => context as unknown as AudioContext,
      createWorkletNode: () => workletNode as unknown as AudioWorkletNode,
      moduleUrl: "/pcm-recorder.worklet.js",
      now: () => new Date("2026-09-03T00:00:00.000Z"),
    });

    const info = await source.prepare();
    expect(info.sampleRate).toBe(48_000);
    await source.start();
    const recording = await source.stop();

    expect([...recording.samples]).toEqual([
      Math.fround(0.1),
      Math.fround(-0.2),
      Math.fround(0.3),
    ]);
    expect(recording.metadata.startedAt).toBe("2026-09-03T00:00:00.000Z");
    expect(trackStopped).toBe(true);
    expect(contextClosed).toBe(true);
    expect(disconnects).toEqual(
      expect.arrayContaining(["media", "worklet", "gain"]),
    );
    expect(port.onmessage).toBeNull();
    expect(source.state).toBe("completed");
  });

  it("rejects a second start while already recording", async () => {
    const port = { onmessage: null, postMessage: () => undefined };
    const baseNode = { connect: () => undefined, disconnect: () => undefined };
    const track = {
      stop: () => undefined,
      getSettings: () => ({ channelCount: 1 }),
    };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    const context = {
      sampleRate: 48_000,
      state: "running",
      audioWorklet: { addModule: () => Promise.resolve() },
      createMediaStreamSource: () => baseNode,
      createGain: () => ({ ...baseNode, gain: { value: 1 } }),
      destination: baseNode,
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    const source = new BrowserAudioSource(-0.25, {
      getUserMedia: () => Promise.resolve(stream as unknown as MediaStream),
      createAudioContext: () => context as unknown as AudioContext,
      createWorkletNode: () =>
        ({ ...baseNode, port }) as unknown as AudioWorkletNode,
      moduleUrl: "/pcm-recorder.worklet.js",
      now: () => new Date(0),
    });
    await source.prepare();
    await source.start();
    await expect(source.start()).rejects.toMatchObject({
      code: "invalid-state",
    });
    await source.dispose();
  });
});
