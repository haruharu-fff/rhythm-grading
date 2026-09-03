const CHUNK_FRAMES = 2048;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.chunk = new Float32Array(CHUNK_FRAMES);
    this.offset = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "start") {
        this.offset = 0;
        this.recording = true;
      } else if (event.data?.type === "stop") {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: "stopped" });
      }
    };
  }

  flush() {
    if (this.offset === 0) return;
    const output = this.chunk.slice(0, this.offset);
    this.port.postMessage({ type: "chunk", buffer: output.buffer }, [
      output.buffer,
    ]);
    this.chunk = new Float32Array(CHUNK_FRAMES);
    this.offset = 0;
  }

  process(inputs) {
    if (!this.recording) return true;
    const channels = inputs[0];
    if (channels === undefined || channels.length === 0) return true;
    const frames = channels[0].length;
    for (let frame = 0; frame < frames; frame += 1) {
      let mixed = 0;
      for (const channel of channels) mixed += channel[frame] ?? 0;
      this.chunk[this.offset] = mixed / channels.length;
      this.offset += 1;
      if (this.offset === this.chunk.length) this.flush();
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
