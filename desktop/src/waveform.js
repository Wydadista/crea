const { spawn } = require("node:child_process");
// Full-band stereo PCM, 2000 independent peak bins/s (0.5 ms), plus a max pyramid.
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
      energy = [0, 0],
      sample = 0,
      peak = 0,
      count = 0,
      stderr = "",
      error;
    child.stdout.on("data", (data) => {
      data = Buffer.concat([tail, data]);
      const end = data.length - (data.length % 2);
      for (let i = 0; i < end; i += 2) {
        const value = data.readInt16LE(i) / 32768;
        energy[sample++ % 2] += value * value;
        peak = Math.max(peak, Math.abs(value));
        if (++count === 48) {
          peaks.push(peak < 1 / 32768 ? 0 : peak);
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
      if (count) peaks.push(peak < 1 / 32768 ? 0 : peak);
      const levelsOfDetail = [];
      let current = Float32Array.from(peaks),
        rate = 2000;
      while (current.length > 4) {
        const next = new Float32Array(Math.ceil(current.length / 4));
        for (let i = 0; i < current.length; i++)
          next[Math.floor(i / 4)] = Math.max(
            next[Math.floor(i / 4)],
            current[i],
          );
        rate /= 4;
        levelsOfDetail.push({ rate, peaks: next });
        current = next;
      }
      resolve({
        rate: 2000,
        levelsOfDetail,
        peaks: Float32Array.from(peaks),
        levels: energy.map((v) => Math.sqrt(v / Math.max(1, sample / 2))),
      });
    });
  });
}
module.exports = { waveform };
