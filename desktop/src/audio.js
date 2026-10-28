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
function volumeFilter(c, sourceStart = c.in) {
  const T = require("./model");
  if (!c.volumePoints?.length) return `volume=${c.volume}`;
  const points = c.volumePoints;
  const rate = c.speed || 1;
  let expr = String(points.at(-1).value);
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1],
      b = points[i];
    const ta = (a.time - sourceStart) / rate,
      tb = (b.time - sourceStart) / rate;
    const line = `${a.value}+(${b.value - a.value})*(t-(${ta}))/(${tb - ta})`;
    expr = `if(lt(t,${tb}),${line},${expr})`;
  }
  expr = `if(lt(t,${(points[0].time - sourceStart) / rate}),${points[0].value},${expr})`;
  return `volume='if(isnan(t),${T.volumeAt(c, sourceStart)},${expr})':eval=frame`;
}
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
module.exports = { audioFilters, channelLevels, rememberLevels, volumeFilter };
