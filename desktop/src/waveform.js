const { spawn } = require("node:child_process");
// Full-band stereo PCM peaks: 50 bins/s, max across channels. Empty speech produces an empty baseline.
function waveform(file, ffmpeg, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-v",
        "error",
        "-nostdin",
        "-i",
        file,
        "-vn",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-f",
        "s16le",
        "pipe:1",
      ],
      { windowsHide: true, signal },
    );
    const peaks = [];
    let tail = Buffer.alloc(0),
      peak = 0,
      count = 0,
      stderr = "",
      error;
    child.stdout.on("data", (data) => {
      data = Buffer.concat([tail, data]);
      const end = data.length - (data.length % 2);
      for (let i = 0; i < end; i += 2) {
        peak = Math.max(peak, Math.abs(data.readInt16LE(i)) / 32768);
        if (++count === 1920) {
          peaks.push(peak < 0.002 ? 0 : peak);
          peak = 0;
          count = 0;
        }
      }
      tail = data.subarray(end);
    });
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    child.on("error", (e) => {
      error = e;
    });
    child.on("close", (code) => {
      if (code || error) return reject(error || Error(stderr));
      if (count) peaks.push(peak < 0.002 ? 0 : peak);
      resolve({ rate: 50, peaks: Float32Array.from(peaks) });
    });
  });
}
module.exports = { waveform };
