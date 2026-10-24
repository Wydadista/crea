const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const cache = new Map();
function enginePaths() {
  const packaged =
    !!process.versions.electron && require("electron").app.isPackaged;
  const base = packaged
    ? path.join(process.resourcesPath, "vendor/deepfilter")
    : path.join(__dirname, "../vendor/deepfilter");
  const dir = path.join(base, process.platform);
  return {
    engine: path.join(
      dir,
      process.platform === "win32" ? "deep-filter.exe" : "deep-filter",
    ),
    model: path.join(dir, "DeepFilterNet3_onnx.tar.gz"),
  };
}
async function denoisedMedia(c, m, ffmpeg, signal) {
  if (!c.voice?.noise || c.voice.bypass || !m.hasAudio) return m;
  const stat = await fs.stat(m.path),
    intensity = Math.max(0, Math.min(1, c.voice.noise)),
    attenuation = 6 + intensity * 18;
  const key = crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        "DF3-0.5.6",
        m.path,
        stat.size,
        stat.mtimeMs,
        attenuation,
      ]),
    )
    .digest("hex");
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
        const { engine, model } = enginePaths();
        try {
          await fs.access(engine);
          await fs.access(model);
        } catch {
          throw Error(
            "Motore DeepFilterNet3 assente. Chiudi Akhbar Studio ed esegui npm ci nella cartella desktop.",
          );
        }
        const dir = path.join(os.tmpdir(), "akhbar-deepfilter3", key);
        await fs.mkdir(dir, { recursive: true });
        const final = path.join(
          dir,
          m.kind === "video" ? "processed.mkv" : "processed.wav",
        );
        try {
          await fs.access(final);
          return { ...m, path: final, deepFilterProcessed: true };
        } catch {}
        const input = path.join(dir, "source.wav");
        const opts = { windowsHide: true, maxBuffer: 4 * 1024 * 1024, signal };
        await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-nostdin",
            "-y",
            "-i",
            m.path,
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            input,
          ],
          opts,
        );
        const out = path.join(dir, "clean");
        await fs.mkdir(out, { recursive: true });
        await run(
          engine,
          ["-m", model, "-D", "-a", String(attenuation), "-o", out, input],
          opts,
        );
        const candidates = (await fs.readdir(out)).filter((f) =>
          f.endsWith(".wav"),
        );
        if (candidates.length !== 1)
          throw Error("DeepFilterNet3 non ha prodotto il file audio");
        const clean = path.join(out, candidates[0]),
          temp = path.join(
            dir,
            m.kind === "video" ? "result.mkv" : "result.wav",
          );
        await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-nostdin",
            "-y",
            ...(m.kind === "video" ? ["-i", m.path] : []),
            "-i",
            clean,
            ...(m.kind === "video"
              ? ["-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy"]
              : []),
            "-af",
            `apad,atrim=duration=${m.duration}`,
            "-ar",
            "48000",
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            temp,
          ],
          opts,
        );
        await fs.rename(temp, final);
        await fs.rm(input, { force: true });
        await fs.rm(out, { recursive: true, force: true });
        return { ...m, path: final, deepFilterProcessed: true };
      })().catch((e) => {
        cache.delete(key);
        throw e;
      }),
    );
  return cache.get(key);
}
module.exports = { denoisedMedia, enginePaths };
