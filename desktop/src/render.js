const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const T = require("./model");
const { audioFilters } = require("./audio");
function maskedEffect(filters, effect, name, id) {
  if (effect.shape !== "circle") return name;
  const masked = `mask${id}`;
  filters.push(
    `[${name}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2),1),255,0)'[${masked}]`,
  );
  return masked;
}
function encoding(s, project) {
  const fps = Number(s.fps),
    { width, height } = T.outputSize(project || { media: [] }, s.height);
  const old = { small: 30, balanced: 23, high: 18 };
  if (
    s.keyframeSeconds !== undefined &&
    (!Number.isFinite(s.keyframeSeconds) ||
      s.keyframeSeconds < 1 ||
      s.keyframeSeconds > 30)
  )
    throw Error("Intervallo keyframe: 1–30 secondi");
  const quality = s.quality === undefined ? 70 : Number(s.quality);
  const crf = Object.hasOwn(old, s.quality)
    ? old[s.quality]
    : Math.round(40 - quality * 0.26);
  if (
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 120 ||
    !(s.height === "original" || [720, 1080, 1440, 2160].includes(height)) ||
    (!Object.hasOwn(old, s.quality) &&
      (!Number.isFinite(quality) || quality < 1 || quality > 100))
  )
    throw Error("FPS: 1–120; qualità: 1–100%; risoluzione non valida");
  return {
    fps,
    height,
    width,
    crf,
    pixelFormat: width % 2 || height % 2 ? "yuv444p" : "yuv420p",
  };
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
  const p = T.validate({
      ...input,
      media: input.media.map((m) => ({ ...m })),
      clips: input.clips.map((c) => ({ ...c })),
    }),
    cfg = encoding(settings, p),
    { fps, width: W, height: H, crf } = cfg,
    total = T.total(p.clips);
  if (!total) throw Error("Aggiungi una clip alla timeline");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-render-"));
  const begun = performance.now();
  const stages = [];
  let fallbackFrom = null,
    decoder = "cpu";
  let directIntervals = 0,
    compositedIntervals = 0;
  let actualEncoder = "libx264",
    pathName = "composizione",
    lastPercent = 0;
  const details = () => ({
    elapsedSeconds: (performance.now() - begun) / 1000,
    encoder: actualEncoder,
    decoder,
    fallbackFrom,
    path: pathName,
    stages,
    directIntervals,
    compositedIntervals,
    totalSeconds: total,
  });
  const report = (percent, message) => {
    lastPercent = Math.max(lastPercent, Math.min(99, Math.floor(percent)));
    progress({
      percent: lastPercent,
      message,
      processedSeconds: Math.min(total, (percent * total) / 99),
      ...details(),
    });
  };
  progress({ percent: 0, message: "Preparazione esportazione" });
  const run = (
    args,
    offset = 0,
    duration = 0,
    phase = "Composizione",
    units = total,
  ) =>
    new Promise((resolve, reject) => {
      report(lastPercent, phase);
      const child = spawn(
        binaries.ffmpeg,
        [
          "-hide_banner",
          "-v",
          "error",
          "-nostdin",
          "-filter_complex_threads",
          "1",
          "-progress",
          "pipe:1",
          "-nostats",
          ...args,
        ],
        { windowsHide: true, signal },
      );
      const phaseStart = performance.now();
      let pending = "";
      child.stdout.on("data", (data) => {
        pending += data.toString();
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines)
          if (line.startsWith("out_time_us=")) {
            const seconds = Number(line.slice(12)) / 1e6;
            if (Number.isFinite(seconds) && duration)
              report(
                ((offset + Math.min(duration, Math.max(0, seconds))) / units) *
                  99,
                phase,
              );
          }
      });
      let stderr = "",
        error;
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-8000)));
      child.once("error", (e) => {
        error = e;
      });
      child.once("close", (code) => {
        stages.push({
          phase,
          seconds: (performance.now() - phaseStart) / 1000,
          encoder: actualEncoder,
        });
        code === 0 && !error
          ? resolve()
          : reject(error || Error(stderr || "Esportazione interrotta"));
      });
    });
  try {
    for (const c of p.clips) {
      const m = p.media.find((m) => m.id === c.mediaId);
      if (c.voice?.noise && !c.voice.bypass && m.hasAudio) {
        report(0, "Riduzione rumore DeepFilterNet3…");
        const clean = await require("./deepfilter").denoisedMedia(
          c,
          m,
          binaries.ffmpeg,
          signal,
        );
        const id = "deepfilter-" + c.id;
        p.media.push({ ...clean, id });
        c.mediaId = id;
      }
    }
    const enc = require("./encoders");
    const requested = settings.encoder || "cpu";
    if (requested !== "cpu" && !enc.candidates.some(([id]) => id === requested))
      throw Error("Encoder non valido");
    let encoder = requested;
    if (
      !settings.preserveOriginal &&
      encoder !== "cpu" &&
      !(await enc.detect(binaries.ffmpeg, cfg)).some((e) => e.id === encoder)
    ) {
      encoder = "cpu";
      fallbackFrom = requested;
      report(
        0,
        "GPU non disponibile: ripiego CPU verificato prima del rendering",
      );
    }
    actualEncoder = encoder === "cpu" ? "libx264" : encoder;
    if (
      settings.cpuPreset &&
      !["fast", "veryfast"].includes(settings.cpuPreset)
    )
      throw Error("Preset CPU non valido");
    const videoArgs = () => [
      ...enc.args(encoder, crf, settings.cpuPreset || "veryfast"),
      "-g",
      String(
        settings.keyframeSeconds
          ? Math.round(fps * settings.keyframeSeconds)
          : 250,
      ),
      "-threads",
      String(enc.threadBudget()),
      "-pix_fmt",
      cfg.pixelFormat,
    ];
    const single = simpleClip(p);
    if (single) {
      pathName = "diretto";
      const { c, m } = single;
      const target = path.join(dir, "direct.mp4");
      const copy =
        settings.preserveOriginal === true &&
        (await canCopy(
          c,
          m,
          cfg,
          p,
          binaries.ffprobe,
          settings.keyframeSeconds,
        ));
      if (settings.preserveOriginal && !copy)
        throw Error(
          "Copia originale incompatibile: disattivala per applicare FPS, risoluzione o elaborazioni audio richieste",
        );
      if (copy) {
        actualEncoder = "copy";
        pathName = "copia flussi";
        await run(
          [
            "-y",
            "-i",
            m.path,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            target,
          ],
          0,
          total,
          "Copia flussi originali (nessuna ricodifica)",
        );
      } else {
        let cuda = false;
        if (
          encoder === "h264_nvenc" &&
          m.width === W &&
          m.height === H &&
          cfg.pixelFormat === "yuv420p"
        ) {
          try {
            await require("node:util").promisify(execFile)(
              binaries.ffmpeg,
              [
                "-v",
                "error",
                "-nostdin",
                "-ss",
                String(c.in),
                "-hwaccel",
                "cuda",
                "-hwaccel_output_format",
                "cuda",
                "-i",
                m.path,
                "-frames:v",
                "2",
                "-an",
                "-vf",
                `fps=${fps},setsar=1`,
                ...enc.args(encoder, crf),
                "-pix_fmt",
                "cuda",
                "-f",
                "null",
                "-",
              ],
              { windowsHide: true, timeout: 15000, signal },
            );
            cuda = true;
            decoder = "cuda";
          } catch (e) {
            if (signal?.aborted) throw e;
            report(
              0,
              "Decodifica CUDA non disponibile: decodifica CPU e codifica NVIDIA",
            );
          }
        }
        const audible =
          m.hasAudio && !c.muted && !p.trackMuted?.[c.track] && c.volume > 0;
        const args = [
          "-y",
          "-ss",
          String(c.in),
          // Keep the frame held at the cut, including sparse screen recordings.
          "-noaccurate_seek",
          ...(cuda
            ? ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"]
            : []),
          "-i",
          m.path,
        ];
        if (!audible)
          args.push(
            "-f",
            "lavfi",
            "-i",
            `anullsrc=r=48000:cl=stereo:d=${total}`,
          );
        args.push("-map", "0:v:0");
        const vf = [
          `fps=${fps}:start_time=0:round=up`,
          "tpad=stop_mode=clone:stop_duration=1",
          ...(cuda
            ? []
            : [
                `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
                `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`,
              ]),
          "setsar=1",
        ];
        const codecArgs = videoArgs();
        if (cuda) codecArgs[codecArgs.indexOf("-pix_fmt") + 1] = "cuda";
        args.push("-vf", vf.join(","), ...codecArgs);
        if (
          m.hasAudio &&
          !c.muted &&
          !p.trackMuted?.[c.track] &&
          c.volume > 0
        ) {
          const af = await audioFilters(c, m, binaries.ffmpeg);
          args.push(
            "-map",
            "0:a:0",
            "-af",
            [
              "atrim=start=0",
              "asetpts=PTS-STARTPTS",
              af,
              `volume=${c.volume}`,
              "apad",
              `atrim=duration=${total}`,
            ]
              .filter(Boolean)
              .join(","),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
          );
        } else args.push("-map", "1:a:0", "-c:a", "aac", "-b:a", "192k");
        args.push(
          "-t",
          String(Math.ceil(total * fps) / fps),
          "-fps_mode",
          "cfr",
          "-movflags",
          "+faststart",
          target,
        );
        await run(args, 0, total, "Codifica diretta · " + actualEncoder);
      }
      if (signal?.aborted) throw Error("Esportazione annullata");
      await fs.copyFile(target, output);
      progress({
        percent: 100,
        message: "Esportazione completata",
        ...details(),
      });
      return output;
    }
    if (settings.preserveOriginal)
      throw Error(
        "Copia originale disponibile solo per una clip intera senza modifiche",
      );
    const renderPlainInterval = async (c, m, start, duration, part) => {
      const offset = Math.max(c.in, T.sourceTime(c, start));
      const args = [
        "-y",
        "-ss",
        String(offset),
        "-noaccurate_seek",
        "-i",
        m.path,
      ];
      const audible =
        m.hasAudio && !c.muted && !p.trackMuted?.[c.track] && c.volume > 0;
      if (!audible)
        args.push(
          "-f",
          "lavfi",
          "-i",
          `anullsrc=r=48000:cl=stereo:d=${duration}`,
        );
      const video = [
        `fps=${fps}:start_time=0:round=up`,
        `tpad=stop_mode=clone:stop_duration=${duration}`,
        `trim=duration=${duration}`,
        ...(m.width === W && m.height === H
          ? []
          : [
              `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
              `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`,
            ]),
        "setsar=1",
      ];
      args.push(
        "-map",
        "0:v:0",
        "-vf",
        video.join(","),
        ...videoArgs(),
        "-bf",
        "0",
      );
      if (audible) {
        const processing = await audioFilters(c, m, binaries.ffmpeg);
        args.push(
          "-map",
          "0:a:0",
          "-af",
          [
            "atrim=start=0",
            "asetpts=PTS-STARTPTS",
            processing,
            `volume=${c.volume}`,
            "apad",
            `atrim=duration=${duration}`,
          ]
            .filter(Boolean)
            .join(","),
        );
      } else args.push("-map", "1:a:0");
      args.push(
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-t",
        String(duration),
        "-fps_mode",
        "cfr",
        path.join(dir, part),
      );
      directIntervals++;
      pathName = compositedIntervals ? "montaggio misto" : "montaggio diretto";
      await run(
        args,
        start,
        duration,
        "Clip senza sovrapposizioni · " + actualEncoder,
      );
    };
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
      // Most cut-only intervals need neither a synthetic canvas nor RGBA overlays.
      const plain =
        active.length === 1 &&
        simpleClip({ ...p, clips: [{ ...active[0], start: 0 }] });
      if (plain) {
        const part = `part-${interval}.nut`;
        await renderPlainInterval(active[0], plain.m, start, d, part);
        concat.push(`file '${part}'\nduration ${d}`);
        report(
          ((start + d) / total) * 99,
          `Montaggio ${interval + 1}/${bounds.length - 1}`,
        );
        continue;
      }
      compositedIntervals++;
      pathName = directIntervals ? "montaggio misto" : "composizione";
      const args = [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=black:s=${W}x${H}:r=${fps}:d=${d},format=${cfg.pixelFormat}`,
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
        if (p.media.find((m) => m.id === c.mediaId).kind === "effect") {
          const e = c.effect;
          if (e?.type && e.type !== "none") {
            const id = ++vi,
              x = Math.round((e.x / 100) * W),
              y = Math.round((e.y / 100) * H),
              w = Math.min(W - x, Math.max(2, Math.round((e.width / 100) * W))),
              h = Math.min(
                H - y,
                Math.max(2, Math.round((e.height / 100) * H)),
              );
            filters.push(`[${video}]split[eb${id}][ec${id}]`);
            const fx =
              e.type === "blur"
                ? `gblur=sigma=${Math.max(0.1, (e.strength * H) / 1080)}`
                : `scale=${Math.max(1, Math.round(w / Math.max(2, (e.strength * H) / 1080)))}:${Math.max(1, Math.round(h / Math.max(2, (e.strength * H) / 1080)))}:flags=area,scale=${w}:${h}:flags=neighbor`;
            filters.push(`[ec${id}]crop=${w}:${h}:${x}:${y},${fx}[ef${id}]`);
            const masked = maskedEffect(filters, e, `ef${id}`, id);
            filters.push(
              `[eb${id}][${masked}]overlay=${x}:${y}:shortest=1:format=${cfg.pixelFormat === "yuv444p" ? "auto" : "yuv420"}[v${id}]`,
            );
            video = `v${id}`;
          }
          continue;
        }
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
          // Do not stop the video demuxer at the cut end: a following sparse
          // frame is needed to determine how long the preceding image is held.
          // The output video/audio filters enforce the selected duration.
          args.push(
            "-ss",
            String(offset),
            ...(m.kind === "video"
              ? ["-noaccurate_seek"]
              : ["-t", String(d * speed + 0.1)]),
            "-i",
            m.path,
          );
        if (m.kind !== "audio") {
          const id = ++vi,
            l = c.layout || { x: 0, y: 0, width: 100, height: 100 },
            rw =
              m.kind === "annotation"
                ? W
                : Math.max(2, Math.round((W * l.width) / 100)),
            rh =
              m.kind === "annotation"
                ? H
                : Math.max(2, Math.round((H * l.height) / 100));
          let chain = `[${inputIndex}:v]setpts=PTS/${speed},fps=${fps}:start_time=0:round=up,tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},scale=${rw}:${rh}:force_original_aspect_ratio=decrease,pad=${rw}:${rh}:(ow-iw)/2:(oh-ih)/2:color=black${["annotation", "image"].includes(m.kind) ? "@0" : ""},setsar=1,format=rgba`;
          if (l.content && m.kind !== "annotation") {
            const b = l.content,
              x = Math.round((b.x / 100) * rw),
              y = Math.round((b.y / 100) * rh),
              w = Math.max(
                1,
                Math.min(rw - x, Math.round((b.width / 100) * rw)),
              ),
              h = Math.max(
                1,
                Math.min(rh - y, Math.round((b.height / 100) * rh)),
              );
            chain = `[${inputIndex}:v]setpts=PTS/${speed},fps=${fps}:start_time=0:round=up,tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},scale=${w}:${h},pad=${rw}:${rh}:${x}:${y}:color=black${m.kind === "image" ? "@0" : ""},setsar=1,format=rgba`;
          }
          const z = c.zoom || { from: 1, to: 1, x: 0.5, y: 0.5 };
          if (
            m.kind !== "annotation" &&
            (z.from !== 1 || z.to !== 1 || z.keys?.some((k) => k.scale !== 1))
          ) {
            const at = (offset - c.in) / (c.out - c.in),
              slope = (z.to - z.from) / (((c.out - c.in) / speed) * fps),
              base = z.from + (z.to - z.from) * at;
            const source = `${offset}+on*${speed}/${fps}`;
            const zz = T.zoomExpression(c, "scale", source),
              zx = T.zoomExpression(c, "x", source),
              zy = T.zoomExpression(c, "y", source);
            const zoomFilter = `zoompan=z='max(1,min(20,${zz}))':x='(iw-iw/zoom)*(${zx})':y='(ih-ih/zoom)*(${zy})':d=1:s=${rw}x${rh}:fps=${fps}`;
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
            filters.push(effect + `[effect${id}]`);
            const masked = maskedEffect(filters, e, `effect${id}`, id);
            filters.push(
              `[base${id}][${masked}]overlay=${x}:${y}:shortest=1:format=${cfg.pixelFormat === "yuv444p" ? "auto" : "yuv420"}[layer${id}]`,
            );
          } else filters.push(chain + `[layer${id}]`);
          filters.push(
            `[${video}][layer${id}]overlay=${m.kind === "annotation" ? 0 : Math.round((l.x / 100) * W)}:${m.kind === "annotation" ? 0 : Math.round((l.y / 100) * H)}:eof_action=pass:shortest=0:repeatlast=0:format=${cfg.pixelFormat === "yuv444p" ? "auto" : "yuv420"}[v${id}]`,
          );
          video = `v${id}`;
        }
        if (
          m.hasAudio &&
          c.volume > 0 &&
          !c.muted &&
          !p.trackMuted?.[c.track] &&
          ["video", "audio"].includes(m.kind)
        ) {
          const label = `a${inputIndex}`;
          const processing = await audioFilters(c, m, binaries.ffmpeg);
          filters.push(
            `[${inputIndex}:a]atrim=start=0:duration=${d * speed},asetpts=PTS-STARTPTS,${tempo(speed)},${processing ? processing + "," : ""}volume=${c.volume},apad,atrim=duration=${d}[${label}]`,
          );
          audios.push(`[${label}]`);
        }
      }
      filters.push(
        `${audios.join("")}amix=inputs=${audios.length}:duration=first:normalize=0,alimiter=limit=0.95:level=0:latency=1[outa]`,
      );
      const part = `part-${interval}.nut`;
      args.push(
        "-filter_complex_script",
        await (async () => {
          const graph = path.join(dir, `graph-${start}.txt`);
          await fs.writeFile(graph, filters.join(";"));
          return graph;
        })(),
        "-map",
        `[${video}]`,
        "-map",
        "[outa]",
        "-t",
        String(d),
        ...videoArgs(),
        "-bf",
        "0",
        "-pix_fmt",
        cfg.pixelFormat,
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        path.join(dir, part),
      );
      await run(args, start, d);
      concat.push(`file '${part}'\nduration ${d}`);
      report(
        ((start + d) / total) * 99,
        `Composizione ${interval + 1}/${bounds.length - 1}`,
      );
    }
    await fs.writeFile(path.join(dir, "list.txt"), concat.join("\n"));
    const result = path.join(dir, "final.mp4");
    // Every interval is encoded once with the requested encoder/quality. PCM audio
    // is continuous across boundaries and AAC is encoded only once here.
    await run(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        path.join(dir, "list.txt"),
        "-t",
        String(endFrame / fps),
        "-c:v",
        "copy",
        "-bsf:v",
        `setts=pts=N/(${fps}*TB):dts=N/(${fps}*TB):duration=1/(${fps}*TB)`,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        result,
      ],
      0,
      0,
      "Assemblaggio MP4 (video senza ricodifica)",
    );
    if (signal?.aborted) throw Error("Esportazione annullata");
    await fs.copyFile(result, output);
    progress({
      percent: 100,
      message: "Esportazione completata",
      ...details(),
    });
    return output;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
function simpleClip(p) {
  if (p.clips.length !== 1) return null;
  const c = p.clips[0],
    m = p.media.find((m) => m.id === c.mediaId);
  const l = c.layout,
    z = c.zoom;
  if (
    m.kind !== "video" ||
    c.start !== 0 ||
    (c.speed || 1) !== 1 ||
    (c.effect && c.effect.type !== "none") ||
    (l &&
      (l.x !== 0 ||
        l.y !== 0 ||
        l.width !== 100 ||
        l.height !== 100 ||
        (l.content &&
          (l.content.x !== 0 ||
            l.content.y !== 0 ||
            l.content.width !== 100 ||
            l.content.height !== 100)))) ||
    (z && (z.from !== 1 || z.to !== 1 || z.keys?.some((k) => k.scale !== 1)))
  )
    return null;
  return { c, m };
}
async function canCopy(c, m, cfg, p, probe, keyframeSeconds) {
  if (
    c.in !== 0 ||
    Math.abs(c.out - m.duration) > 0.001 ||
    c.mono ||
    c.muted ||
    p.trackMuted?.[c.track] ||
    c.volume !== 1 ||
    c.voice?.noise ||
    c.voice?.level
  )
    return false;
  const { stdout } = await require("node:util").promisify(execFile)(
    probe,
    ["-v", "error", "-show_streams", "-of", "json", m.path],
    { windowsHide: true },
  );
  const streams = JSON.parse(stdout).streams,
    v = streams.find((s) => s.codec_type === "video"),
    a = streams.find((s) => s.codec_type === "audio");
  const rate = (value) => {
    const [n, d = 1] = String(value).split("/").map(Number);
    return n / d;
  };
  const compatible =
    v?.codec_name === "h264" &&
    (!a || a.codec_name === "aac") &&
    v.width === cfg.width &&
    v.height === cfg.height &&
    v.pix_fmt === cfg.pixelFormat &&
    (!v.sample_aspect_ratio ||
      ["1:1", "N/A"].includes(v.sample_aspect_ratio)) &&
    !v.tags?.rotate &&
    !v.side_data_list?.some((d) => d.rotation) &&
    Math.abs(rate(v.avg_frame_rate) - cfg.fps) < 1e-6 &&
    Math.abs(rate(v.r_frame_rate) - cfg.fps) < 1e-6;
  if (!compatible) return false;
  // Average frame rate alone cannot prove CFR. Check actual packet cadence before
  // allowing a stream copy to stand in for the requested FPS/keyframe settings.
  const packets = await require("node:util").promisify(execFile)(
    probe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_packets",
      "-show_entries",
      "packet=pts_time,flags",
      "-of",
      "csv=p=0",
      m.path,
    ],
    { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = packets.stdout
      .trim()
      .split("\n")
      .map((line) => line.split(",")),
    times = rows.map((r) => Number(r[0])).sort((a, b) => a - b),
    step = 1 / cfg.fps;
  if (
    times.some(
      (t, i) =>
        !Number.isFinite(t) ||
        (i && Math.abs(t - times[i - 1] - step) > 0.0001),
    )
  )
    return false;
  if (keyframeSeconds) {
    const keys = rows
      .filter((r) => r[1]?.includes("K"))
      .map((r) => Number(r[0]))
      .sort((a, b) => a - b);
    if (keys.some((t, i) => i && t - keys[i - 1] > keyframeSeconds + step))
      return false;
    if (keys.length && times.at(-1) - keys.at(-1) > keyframeSeconds + step)
      return false;
  }
  return true;
}
module.exports = { renderProject, encoding, tempo, simpleClip, canCopy };
