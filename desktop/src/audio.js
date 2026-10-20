const { waveform } = require("./waveform");
const cache = new Map();
async function audioFilters(c, m, ffmpeg) {
  const filters = [];
  if (c.mono) {
    const fs = require("node:fs/promises");
    const stat = await fs.stat(m.path),
      key = m.path + ":" + stat.size + ":" + stat.mtimeMs;
    if (!cache.has(key))
      cache.set(
        key,
        waveform(m.path, ffmpeg).catch((e) => {
          cache.delete(key);
          throw e;
        }),
      );
    const { levels = [1, 1] } = await cache.get(key);
    const [l, r] = levels;
    // Keep a lone voice at its original level; averaging two active channels cannot clip.
    filters.push(
      l < r * 0.01
        ? "pan=stereo|c0=c1|c1=c1"
        : r < l * 0.01
          ? "pan=stereo|c0=c0|c1=c0"
          : "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
    );
  }
  if (c.voice?.noise)
    filters.push(`afftdn=nr=${(c.voice.noise * 24).toFixed(2)}:nf=-40`);
  if (c.voice?.level)
    filters.push(
      `dynaudnorm=f=250:g=15:p=${(0.5 + c.voice.level * 0.4).toFixed(2)}:m=${(1 + c.voice.level * 9).toFixed(2)}`,
    );
  return filters.join(",");
}
module.exports = { audioFilters };
