const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const T = require("../src/model"),
  { collectProject, reserveRecording } = require("../src/storage"),
  { renderProject } = require("../src/render"),
  { Recording } = require("../src/recording");
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
const clip = (id, start, source = "A") => ({
  id,
  sourceInstanceId: source,
  mediaId: "m",
  start,
  track: 0,
  in: 0,
  out: 2,
  speed: 1,
  volume: 1,
});
function project() {
  const p = T.empty();
  p.media = [
    { id: "m", name: "m", path: "/unused", kind: "video", duration: 100 },
  ];
  return p;
}
test("family ripple closes only deleted insertion segments; independent insert of same file stays fixed", () => {
  const p = project();
  p.clips = [clip("a1", 0), clip("a2", 2), clip("a3", 4), clip("b", 10, "B")];
  const out = T.deleteFamilySegments(p, ["a2"], true);
  assert.equal(out.clips.find((c) => c.id === "a3").start, 2);
  assert.equal(out.clips.find((c) => c.id === "b").start, 10);
  assert.equal(
    T.deleteFamilySegments(p, ["a2"], false).clips.find((c) => c.id === "a3")
      .start,
    4,
  );
  assert.equal(p.clips.length, 4);
});
test("overdub mutes chosen interval only; original trims and independent clips survive reopen", () => {
  const p = project();
  p.clips = [{ ...clip("a", 0), out: 10 }, clip("b", 20, "B")];
  const out = T.muteRange(p, ["a"], 3, 6, () => crypto.randomUUID());
  assert.deepEqual(
    out.clips
      .filter((c) => c.sourceInstanceId === "A")
      .sort((a, b) => a.start - b.start)
      .map((c) => [c.start, c.in, c.out, !!c.muted]),
    [
      [0, 0, 3, false],
      [3, 3, 6, true],
      [6, 6, 10, false],
    ],
  );
  assert.equal(out.clips.find((c) => c.id === "b").start, 20);
  assert.deepEqual(
    T.validate(JSON.parse(JSON.stringify(out))).clips,
    out.clips,
  );
  assert.equal(p.clips.length, 2);
});
test("portable projects deduplicate media and survive folder move; numbered files never overwrite", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-storage-"));
  try {
    const source = path.join(dir, "original.wav");
    await fs.writeFile(source, "unchanged original");
    const p = project();
    p.media[0].path = source;
    p.media.push({ ...p.media[0], id: "second" });
    p.clips = [clip("a", 0)];
    const file = path.join(dir, "Project", "test.creastudio"),
      saved = await collectProject(p, file);
    assert.equal(saved.media[0].path, saved.media[1].path);
    assert.equal(path.isAbsolute(saved.media[0].path), false);
    await collectProject(p, file);
    assert.equal(
      (await fs.readdir(path.join(dir, "Project", "Media"))).length,
      1,
    );
    await fs.rename(path.join(dir, "Project"), path.join(dir, "Moved"));
    assert.equal(
      await fs.readFile(
        path.resolve(dir, "Moved", saved.media[0].path),
        "utf8",
      ),
      "unchanged original",
    );
    const names = await Promise.all(
      Array.from({ length: 4 }, () => reserveRecording(dir, "ottobre", "mp4")),
    );
    assert.equal(new Set(names).size, 4);
    assert.equal(
      path.basename(await reserveRecording(dir, "ottobre", "mp4")),
      "ottobre-5.mp4",
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("direct export applies FPS/mono, rejects incompatible copy, remux recording preserves tail", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-direct-"));
  try {
    const input = path.join(dir, "in.mp4");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=24",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0|0.3*sin(2*PI*440*t):s=48000",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      input,
    ]);
    const p = project();
    p.media[0] = {
      ...p.media[0],
      path: input,
      duration: 3,
      width: 320,
      height: 180,
      hasAudio: true,
    };
    p.canvasSize = { width: 320, height: 180 };
    p.clips = [{ ...clip("c", 0), out: 3, mono: true }];
    const settings = {
        height: "original",
        fps: 12,
        quality: 65,
        keyframeSeconds: 4,
      },
      events = [],
      output = path.join(dir, "out.mp4");
    await renderProject(p, output, settings, { ffmpeg, ffprobe }, (e) =>
      events.push(e),
    );
    assert.equal(events.at(-1).path, "diretto");
    assert.equal(events.at(-1).encoder, "libx264");
    const probe = async (f) =>
      JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            f,
          ])
        ).stdout,
      );
    const meta = await probe(output);
    assert.equal(meta.streams[0].avg_frame_rate, "12/1");
    assert.ok(Math.abs(Number(meta.format.duration) - 3) < 0.1);
    await assert.rejects(
      renderProject(
        p,
        path.join(dir, "invalid.mp4"),
        { ...settings, preserveOriginal: true },
        { ffmpeg, ffprobe },
      ),
      /incompatibile/,
    );
    p.clips[0].mono = false;
    await renderProject(
      p,
      path.join(dir, "copy.mp4"),
      { ...settings, fps: 24, preserveOriginal: true },
      { ffmpeg, ffprobe },
      (e) => events.push(e),
    );
    assert.equal(events.at(-1).encoder, "copy");
    const recDir = path.join(dir, "capture");
    await fs.mkdir(recDir);
    const recorded = path.join(dir, "recorded.mp4");
    const rec = await new Recording(ffmpeg, recDir, recorded, {
      ...settings,
      format: "mp4",
      mime: "video/mp4;codecs=avc1.42001E,mp4a.40.2",
      audioBitrate: 192,
    }).begin();
    const bytes = await fs.readFile(input);
    for (let i = 0; i < bytes.length; i += 32768)
      await rec.append(bytes.subarray(i, i + 32768));
    await rec.finish();
    assert.equal(rec.metrics.videoReencoded, false);
    const r = await probe(recorded);
    assert.ok(Math.abs(Number(r.format.duration) - 3) < 0.1);
    const tail = (
      await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-ss",
          "2.9",
          "-i",
          recorded,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 2e6 },
      )
    ).stdout;
    assert.ok(tail.length > 0);
    await rec.dispose();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("default mono preserves the level of a genuinely single-channel source", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-mono-"));
  try {
    const input = path.join(dir, "voice.wav"),
      output = path.join(dir, "stereo.wav");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.3*sin(2*PI*440*t):s=48000",
      "-t",
      "1",
      input,
    ]);
    const filter = await require("../src/audio").audioFilters(
      { mono: true },
      { path: input },
      ffmpeg,
    );
    await run(ffmpeg, ["-v", "error", "-i", input, "-af", filter, output]);
    const levels = await require("../src/audio").channelLevels(output, ffmpeg);
    assert.ok(
      levels.every((level) => Math.abs(level - 0.3 / Math.sqrt(2)) < 0.002),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
