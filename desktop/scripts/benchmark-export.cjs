// Repeatable export benchmark. Never overwrites source media or tracked files.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path,
  T = require("../src/model");
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, "");
  options[key] = process.argv[i + 1]?.startsWith("--")
    ? true
    : (process.argv[++i] ?? true);
}
(async () => {
  const dir = path.resolve(
    options.output || path.join(os.tmpdir(), "akhbar-export-benchmark"),
  );
  await fs.mkdir(dir, { recursive: true });
  const probe = async (file) =>
    JSON.parse(
      (
        await run(
          ffprobe,
          ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
          { maxBuffer: 4e6 },
        )
      ).stdout,
    );
  if (!options.input)
    throw Error(
      "Specificare --input percorso/video.mp4 (il file non viene modificato)",
    );
  const input = path.resolve(options.input),
    metadata = await probe(input),
    video = metadata.streams.find((s) => s.codec_type === "video");
  if (!video) throw Error("La sorgente deve contenere video");
  const duration = Number(options.duration || metadata.format.duration),
    fps = Number(options.fps || 12),
    quality = Number(options.quality || 65);
  if (!(duration > 0 && duration <= Number(metadata.format.duration)))
    throw Error("Durata benchmark non valida");
  const settings = {
    height:
      options.height === "original" || !options.height
        ? "original"
        : Number(options.height),
    fps,
    quality,
    encoder: options.encoder || "cpu",
    cpuPreset: options.preset || "veryfast",
    ...(options.keyframe ? { keyframeSeconds: Number(options.keyframe) } : {}),
  };
  let engine = require("../src/render"),
    baselineDir;
  if (options.baseline) {
    baselineDir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-baseline-"));
    for (const name of [
      "render.js",
      "model.js",
      "audio.js",
      "waveform.js",
      "encoders.js",
    ]) {
      let source = (
        await run("git", ["show", `${options.baseline}:desktop/src/${name}`], {
          cwd: path.resolve(__dirname, "../.."),
          maxBuffer: 4e6,
        })
      ).stdout;
      // Old UI has no GOP control. Parameter plumbing only, for a matching-GOP comparison.
      if (name === "render.js" && options.keyframe)
        source = source.replace(
          /"-c:v",\s*"libx264",/g,
          '"-g", String(Math.round(settings.keyframeSeconds * fps)), "-c:v", "libx264",',
        );
      await fs.writeFile(path.join(baselineDir, name), source);
    }
    engine = require(path.join(baselineDir, "render"));
  }
  try {
    const media = {
      id: "source",
      path: input,
      name: path.basename(input),
      kind: "video",
      width: video.width,
      height: video.height,
      duration: Number(metadata.format.duration),
      hasAudio: metadata.streams.some((s) => s.codec_type === "audio"),
    };
    const p = T.empty();
    p.canvasSize = { width: video.width, height: video.height };
    p.media = [media];
    p.clips = [
      {
        id: "video",
        sourceInstanceId: "A",
        mediaId: media.id,
        track: 0,
        start: 0,
        in: 0,
        out: duration,
        speed: 1,
        volume: 1,
        mono: false,
      },
    ];
    if (options.montage) {
      if (duration < 90)
        throw Error("Per il montaggio servono almeno 90 secondi di sorgente");
      p.clips = [
        [0, 20, 0],
        [30, 55, 20],
        [60, 90, 45],
      ].map(([a, b, start], i) => ({
        ...p.clips[0],
        id: "cut-" + i,
        in: a,
        out: b,
        start,
      }));
      p.trackCount = 3;
      p.trackHeights = [100, 100, 100];
      p.trackMuted = [false, false, false];
      for (const [i, type, start] of [
        [1, "pixel", 10],
        [2, "blur", 35],
      ]) {
        const id = "fx-" + i;
        p.media.push({ id, name: type, kind: "effect", duration: 6 });
        p.clips.push({
          id,
          mediaId: id,
          track: i,
          start,
          in: 0,
          out: 6,
          speed: 1,
          volume: 0,
          effect: { type, x: 20, y: 20, width: 40, height: 40, strength: 40 },
        });
      }
    }
    const name =
        (options.baseline ? "before" : "after") +
        (options.montage ? "-montage" : ""),
      output = path.join(dir, name + ".mp4");
    if (path.resolve(output) === input)
      throw Error("La destinazione coincide con la sorgente");
    const begun = performance.now(),
      events = [];
    let last = "";
    await engine.renderProject(
      p,
      output,
      settings,
      { ffmpeg, ffprobe },
      (event) => {
        events.push({
          ...event,
          wallSeconds: (performance.now() - begun) / 1000,
        });
        if (event.message !== last) {
          console.log(event.percent, event.message);
          last = event.message;
        }
        fs.writeFile(
          path.join(dir, name + "-progress.json"),
          JSON.stringify(event),
        ).catch(() => {});
      },
    );
    const seconds = (performance.now() - begun) / 1000,
      resultMeta = await probe(output),
      total = T.total(p.clips),
      sampleTimes = [0.5, total / 2, total - 0.5],
      checks = [];
    for (const at of sampleTimes) {
      const { stdout } = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-ss",
          String(at),
          "-i",
          output,
          "-frames:v",
          "1",
          "-vf",
          "scale=64:36",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 1e6 },
      );
      if (stdout.length !== 64 * 36 * 3)
        throw Error("Fotogramma mancante a " + at);
      const pcm = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-ss",
          String(at),
          "-i",
          output,
          "-t",
          "0.1",
          "-vn",
          "-ac",
          "2",
          "-ar",
          "8000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 1e6 },
      );
      checks.push({
        at,
        frameBytes: stdout.length,
        audioBytes: pcm.stdout.length,
      });
    }
    const result = {
      name,
      baseline: options.baseline || null,
      seconds,
      settings,
      source: metadata,
      output: resultMeta,
      expectedDuration: total,
      checks,
      events,
      hardware: {
        platform: process.platform,
        cpu: os.cpus()[0].model,
        logicalCPUs: os.availableParallelism(),
        encoderThreads: require("../src/encoders").threadBudget(),
        gpuAvailable: await require("../src/encoders").detect(ffmpeg),
      },
    };
    await fs.writeFile(
      path.join(dir, name + ".json"),
      JSON.stringify(result, null, 2),
    );
    console.log(
      "RESULT",
      JSON.stringify({
        name,
        seconds,
        settings,
        duration: resultMeta.format.duration,
        checks,
      }),
    );
  } finally {
    if (baselineDir) await fs.rm(baselineDir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
