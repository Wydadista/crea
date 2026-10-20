const { spawn } = require("node:child_process");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const T = require("./model");
function encoding(s) {
  const fps = Number(s.fps),
    height = Number(s.height);
  const old = { small: 30, balanced: 23, high: 18 };
  const quality = s.quality === undefined ? 70 : Number(s.quality);
  const crf = Object.hasOwn(old, s.quality)
    ? old[s.quality]
    : Math.round(40 - quality * 0.26);
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 120 ||
    ![720, 1080, 1440, 2160].includes(height) ||
    (!Object.hasOwn(old, s.quality) &&
      (!Number.isFinite(quality) || quality < 1 || quality > 100))
  )
    throw Error("FPS: 1–120; qualità: 1–100%; risoluzione non valida");
  return { fps, height, width: Math.round((height * 16) / 9 / 2) * 2, crf };
}
function tempo(speed) {
  const filters = [];
  while (speed > 2) {
    filters.push("atempo=2");
    speed /= 2;
  }
  while (speed < 0.5) {
    filters.push("atempo=0.5");
    speed /= 0.5;
  }
  filters.push(`atempo=${speed}`);
  return filters.join(",");
}
async function renderProject(
  input,
  output,
  settings,
  binaries,
  progress = () => {},
  signal,
) {
  const p = T.validate(input),
    cfg = encoding(settings),
    { fps, width: W, height: H, crf } = cfg,
    total = T.total(p.clips);
  if (!total) throw Error("Aggiungi una clip alla timeline");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-render-"));
  const run = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        binaries.ffmpeg,
        [
          "-hide_banner",
          "-v",
          "error",
          "-nostdin",
          "-filter_complex_threads",
          "1",
          ...args,
        ],
        { windowsHide: true, signal },
      );
      let stderr = "",
        error;
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-8000)));
      child.once("error", (e) => {
        error = e;
      });
      child.once("close", (code) =>
        code === 0 && !error
          ? resolve()
          : reject(error || Error(stderr || "Esportazione interrotta")),
      );
    });
  try {
    const rasters = new Map();
    for (const [i, c] of p.clips.entries())
      if (p.media.find((m) => m.id === c.mediaId).kind === "annotation") {
        const r = p.rasters?.[c.id];
        if (
          !r ||
          !Array.isArray(r.frames) ||
          !r.frames.length ||
          r.frames.length > 121 ||
          !Number.isFinite(r.fps) ||
          r.fps < 1 ||
          r.fps > 60
        )
          throw Error("Annotazione da rasterizzare prima dell’esportazione");
        const folder = path.join(dir, `annotation-${i}`);
        await fs.mkdir(folder);
        for (let n = 0; n < r.frames.length; n++) {
          const image = r.frames[n];
          if (
            typeof image !== "string" ||
            !image.startsWith("data:image/png;base64,") ||
            image.length > 12 * 1024 * 1024
          )
            throw Error("Raster annotazione non valido");
          await fs.writeFile(
            path.join(folder, `${String(n).padStart(3, "0")}.png`),
            Buffer.from(image.slice(22), "base64"),
          );
        }
        rasters.set(c.id, { ...r, folder });
      }
    const endFrame = Math.ceil(total * fps),
      spans = p.clips.map((c) => ({
        c,
        start: Math.round(c.start * fps),
        end: Math.max(
          Math.round(c.start * fps) + 1,
          Math.round((c.start + T.duration(c)) * fps),
        ),
      }));
    const bounds = [
      ...new Set([
        0,
        endFrame,
        ...spans.flatMap((s) => [s.start, Math.min(s.end, endFrame)]),
      ]),
    ].sort((a, b) => a - b);
    const concat = [];
    for (let interval = 0; interval < bounds.length - 1; interval++) {
      if (signal?.aborted) throw Error("Esportazione annullata");
      const f0 = bounds[interval],
        f1 = bounds[interval + 1];
      if (f1 <= f0) continue;
      const start = f0 / fps,
        d = (f1 - f0) / fps;
      const active = spans
        .filter((s) => s.start <= f0 && s.end > f0)
        .map((s) => s.c)
        .sort((a, b) => a.track - b.track);
      const args = [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=black:s=${W}x${H}:r=${fps}:d=${d}`,
          "-f",
          "lavfi",
          "-i",
          `anullsrc=r=48000:cl=stereo:d=${d}`,
        ],
        filters = [
          "[0:v]setpts=PTS-STARTPTS[v0]",
          "[1:a]asetpts=PTS-STARTPTS[a0]",
        ];
      let video = "v0",
        vi = 0,
        index = 2;
      const audios = ["[a0]"];
      for (const c of active) {
        const m = p.media.find((m) => m.id === c.mediaId),
          speed = c.speed || 1,
          offset = Math.max(c.in, T.sourceTime(c, start)),
          inputIndex = index++;
        if (m.kind === "annotation") {
          const r = rasters.get(c.id),
            n = Math.min(
              r.frames.length - 1,
              Math.max(0, Math.floor(offset * r.fps)),
            );
          if (n === r.frames.length - 1 || r.frames.length === 1)
            args.push(
              "-loop",
              "1",
              "-framerate",
              String(fps),
              "-i",
              path.join(r.folder, `${String(n).padStart(3, "0")}.png`),
            );
          else
            args.push(
              "-framerate",
              String(r.fps),
              "-start_number",
              String(n),
              "-i",
              path.join(r.folder, "%03d.png"),
            );
        } else if (m.kind === "image")
          args.push("-loop", "1", "-framerate", String(fps), "-i", m.path);
        else
          args.push(
            "-ss",
            String(offset),
            "-t",
            String(d * speed + 0.1),
            "-i",
            m.path,
          );
        if (m.kind !== "audio") {
          const id = ++vi,
            l = c.layout || { x: 0, y: 0, width: 100, height: 100 },
            rw =
              m.kind === "annotation"
                ? W
                : Math.max(2, Math.round((W * l.width) / 100 / 2) * 2),
            rh =
              m.kind === "annotation"
                ? H
                : Math.max(2, Math.round((H * l.height) / 100 / 2) * 2);
          let chain = `[${inputIndex}:v]setpts=(PTS-STARTPTS)/${speed},fps=${fps},tpad=stop_mode=clone:stop_duration=${d},scale=${rw}:${rh}:force_original_aspect_ratio=decrease,pad=${rw}:${rh}:(ow-iw)/2:(oh-ih)/2:color=black${["annotation", "image"].includes(m.kind) ? "@0" : ""},setsar=1,format=rgba`;
          const z = c.zoom || { from: 1, to: 1, x: 0.5, y: 0.5 };
          if (m.kind !== "annotation" && (z.from !== 1 || z.to !== 1)) {
            const at = (offset - c.in) / (c.out - c.in),
              slope = (z.to - z.from) / (((c.out - c.in) / speed) * fps),
              base = z.from + (z.to - z.from) * at;
            const zoomFilter = `zoompan=z='max(1,min(5,${base}+on*${slope}))':x='(iw-iw/zoom)*${z.x}':y='(ih-ih/zoom)*${z.y}':d=1:s=${rw}x${rh}:fps=${fps}`;
            if (m.kind === "image") {
              filters.push(
                chain + `,split[zc${id}][za${id}]`,
                `[za${id}]alphaextract,${zoomFilter}[zam${id}]`,
                `[zc${id}]format=rgb24,${zoomFilter}[zcm${id}]`,
              );
              chain = `[zcm${id}][zam${id}]alphamerge`;
            } else chain += "," + zoomFilter;
          }
          const e = c.effect;
          if (e && e.type !== "none" && m.kind !== "annotation") {
            const x = Math.round((e.x / 100) * rw),
              y = Math.round((e.y / 100) * rh),
              w = Math.min(
                rw - x,
                Math.max(1, Math.round((e.width / 100) * rw)),
              ),
              h = Math.min(
                rh - y,
                Math.max(1, Math.round((e.height / 100) * rh)),
              );
            filters.push(chain + `,split[base${id}][crop${id}]`);
            let effect = `[crop${id}]crop=${w}:${h}:${x}:${y}`;
            if (e.type === "blur")
              effect += `,gblur=sigma=${Math.max(0.1, (e.strength * rh) / 1080)}`;
            else {
              const b = Math.max(2, (e.strength * rh) / 1080);
              effect += `,scale=${Math.max(1, Math.round(w / b))}:${Math.max(1, Math.round(h / b))}:flags=area,scale=${w}:${h}:flags=neighbor`;
            }
            filters.push(
              effect + `[effect${id}]`,
              `[base${id}][effect${id}]overlay=${x}:${y}:shortest=1[layer${id}]`,
            );
          } else filters.push(chain + `[layer${id}]`);
          filters.push(
            `[${video}][layer${id}]overlay=${m.kind === "annotation" ? 0 : Math.round((l.x / 100) * W)}:${m.kind === "annotation" ? 0 : Math.round((l.y / 100) * H)}:eof_action=pass:shortest=0:repeatlast=0[v${id}]`,
          );
          video = `v${id}`;
        }
        if (m.hasAudio && c.volume > 0 && ["video", "audio"].includes(m.kind)) {
          const label = `a${inputIndex}`;
          filters.push(
            `[${inputIndex}:a]asetpts=PTS-STARTPTS,${tempo(speed)},volume=${c.volume},apad,atrim=duration=${d}[${label}]`,
          );
          audios.push(`[${label}]`);
        }
      }
      filters.push(
        `${audios.join("")}amix=inputs=${audios.length}:duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[outa]`,
      );
      const part = `part-${interval}.nut`;
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        `[${video}]`,
        "-map",
        "[outa]",
        "-t",
        String(d),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        String(Math.max(0, crf - 6)),
        "-threads",
        "2",
        "-bf",
        "0",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        path.join(dir, part),
      );
      await run(args);
      concat.push(`file '${part}'\nduration ${d}`);
      progress({
        percent: Math.round(((interval + 1) / bounds.length) * 95),
        message: `Composizione ${interval + 1}/${bounds.length - 1}`,
      });
    }
    await fs.writeFile(path.join(dir, "list.txt"), concat.join("\n"));
    const result = path.join(dir, "final.mp4");
    await run([
      "-y",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      path.join(dir, "list.txt"),
      "-t",
      String(endFrame / fps),
      "-vf",
      `fps=${fps}`,
      "-fps_mode",
      "cfr",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      String(crf),
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      result,
    ]);
    if (signal?.aborted) throw Error("Esportazione annullata");
    await fs.copyFile(result, output);
    progress({ percent: 100, message: "Esportazione completata" });
    return output;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
module.exports = { renderProject, encoding, tempo };
