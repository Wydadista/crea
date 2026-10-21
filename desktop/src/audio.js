const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
async function channelLevels(file, ffmpeg) {
  const { stderr } = await run(
    ffmpeg,
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      file,
      "-vn",
      "-af",
      "astats=metadata=0:reset=0",
      "-f",
      "null",
      "-",
    ],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const levels = [...stderr.matchAll(/RMS level dB: (-?inf|[-\d.]+)/g)].map(
    (m) => (m[1] === "-inf" ? 0 : 10 ** (Number(m[1]) / 20)),
  );
  // astats prints one value per channel plus one Overall value. A mono
  // source therefore has TWO values, not two actual channels.
  return levels.length > 2 ? levels.slice(0, 2) : [levels[0] || 0, 0];
}
const cache = new Map();
async function audioFilters(c, m, ffmpeg) {
  const filters = [];
  if (c.mono && m.audioChannels === 1) filters.push("pan=stereo|c0=c0|c1=c0");
  else if (c.mono) {
    const fs = require("node:fs/promises");
    const stat = await fs.stat(m.path),
      key = m.path + ":" + stat.size + ":" + stat.mtimeMs;
    if (!cache.has(key))
      cache.set(
        key,
        channelLevels(m.path, ffmpeg).catch((e) => {
          cache.delete(key);
          throw e;
        }),
      );
    const levels = await cache.get(key);
    const [l, r] = levels;
    // Keep a lone voice at its original level; averaging two active channels cannot clip.
    filters.push(
      l < r * 0.01
        ? "pan=stereo|c0=c1|c1=c1"
        : r === 0 || r < l * 0.01
          ? "pan=stereo|c0=c0|c1=c0"
          : "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1",
    );
  }
  if (c.voice?.noise && !c.voice.bypass)
    // Modest attenuation, low noise floor, adaptive tracking and smoothed gains.
    // Avoid the previous up-to-24 dB gate-like suppression of quiet consonants.
    filters.push(
      `afftdn=nr=${(2 + c.voice.noise * 8).toFixed(2)}:nf=-50:tn=1:gs=10`,
    );
  if (c.voice?.level && !c.voice.bypass)
    filters.push(
      `dynaudnorm=f=250:g=15:p=${(0.5 + c.voice.level * 0.4).toFixed(2)}:m=${(1 + c.voice.level * 9).toFixed(2)}`,
    );
  return filters.join(",");
}
function rememberLevels(file, stat, levels, channels) {
  if (channels !== 1 && channels !== 2) return;
  const key = file + ":" + stat.size + ":" + stat.mtimeMs;
  if (!cache.has(key))
    cache.set(key, Promise.resolve(channels === 1 ? [levels[0], 0] : levels));
}
module.exports = { audioFilters, channelLevels, rememberLevels };
