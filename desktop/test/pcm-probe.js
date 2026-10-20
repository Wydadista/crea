// Test-only tap: render-thread timestamps, unaffected by delayed GUI callbacks.
class PCMProbe extends AudioWorkletProcessor {
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples)
      this.port.postMessage({
        frame: currentFrame,
        samples: Float32Array.from(samples),
      });
    return true;
  }
}
registerProcessor("pcm-probe", PCMProbe);
