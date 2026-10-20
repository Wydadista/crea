const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
const media = [
  { id: "m", name: "Source", path: "/source.mp4", kind: "video", duration: 20 },
];
const c = (id, start = 0, track = 0) => ({
  id,
  mediaId: "m",
  start,
  track,
  in: 0,
  out: 1,
  volume: 1,
  speed: 1,
});
test("one initial track, 30+ independent universal tracks, disk roundtrip and limits", () => {
  const p = T.empty();
  p.media = media;
  assert.equal(T.trackCount(p), 1);
  for (let i = 1; i < 31; i++) assert.equal(T.addTrack(p), i);
  p.clips = [c("a", 0, 30), c("b", 1, 30)];
  p.trackHeights[30] = 250;
  p.trackMuted[30] = true;
  const restored = T.validate(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored, p);
  for (let i = 31; i < 128; i++) T.addTrack(p);
  assert.throws(() => T.addTrack(p));
});
test("placement blocks overlaps for every media type; adjacent edges and grouped moves remain exact", () => {
  const clips = [c("a"), c("b", 2), c("linked", 2, 1)];
  assert.equal(T.canPlace(clips, [{ ...clips[1], start: 0.5 }]), false);
  assert.equal(T.canPlace(clips, [{ ...clips[1], start: 1 }]), true);
  assert.equal(T.canPlace(clips, [{ ...clips[1], start: 0, track: 1 }]), true);
  const before = JSON.stringify(clips);
  assert.equal(T.move(clips, ["b", "linked"], -1.5, 0, 2), false);
  assert.equal(JSON.stringify(clips), before);
  assert.equal(T.move(clips, ["b", "linked"], -1, 0, 2), true);
  assert.equal(clips[1].start, 1);
  assert.equal(clips[2].start, 1);
  const project = T.empty();
  project.media = media;
  project.clips = [c("first"), c("second", 0.5)];
  assert.throws(() => T.validate(project), /occupato/);
  // Fields that extend duration use the same placement check, not only mouse dragging.
  project.clips[1].start = 1;
  T.validate(project);
  project.clips[0].speed = 0.5;
  assert.throws(() => T.validate(project), /occupato/);
});
test("legacy overlaps migrate to separate tracks without moving/trimming any clip", () => {
  const p = {
    version: 2,
    media,
    clips: [c("a"), c("b", 0.5), c("upper", 0, 1)],
    trackHeights: [80, 140, 80],
    trackMuted: [false, true, false],
  };
  const original = p.clips.map((c) => [c.id, c.start, c.in, c.out]);
  const migrated = T.validate(p);
  assert.equal(T.overlaps(migrated.clips), false);
  assert.deepEqual(
    migrated.clips.map((c) => [c.id, c.start, c.in, c.out]),
    original,
  );
  assert.ok(migrated.clips[2].track > migrated.clips[1].track);
  assert.equal(migrated.trackMuted[migrated.clips[2].track], true);
});
test("track 31 survives save/restore and real MP4 export with its own mute", async () => {
  const fs = require("node:fs/promises"),
    path = require("node:path"),
    os = require("node:os");
  const run = require("node:util").promisify(
    require("node:child_process").execFile,
  );
  const ffmpeg = require("ffmpeg-static"),
    ffprobe = require("ffprobe-static").path;
  const { renderProject } = require("../src/render");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-tracks31-"));
  try {
    const input = path.join(dir, "tone.mp4"),
      output = path.join(dir, "out.mp4");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=160x90:r=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "0.5",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      input,
    ]);
    const p = T.empty();
    for (let i = 1; i < 31; i++) T.addTrack(p);
    p.media = [
      {
        id: "m",
        name: "tone",
        path: input,
        kind: "video",
        hasAudio: true,
        duration: 0.5,
      },
    ];
    p.clips = [{ ...c("top", 0, 30), out: 0.5 }];
    p.trackMuted[30] = true;
    const file = path.join(dir, "project.creastudio");
    await fs.writeFile(file, JSON.stringify(p));
    const reopened = T.validate(JSON.parse(await fs.readFile(file, "utf8")));
    await renderProject(
      reopened,
      output,
      { height: 720, fps: 12, quality: 35 },
      { ffmpeg, ffprobe },
    );
    const frame = (
      await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-i",
          output,
          "-frames:v",
          "1",
          "-vf",
          "scale=1:1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer" },
      )
    ).stdout;
    assert.ok(frame[0] > 180 && frame[1] < 40 && frame[2] < 40);
    const pcm = (
      await run(
        ffmpeg,
        ["-v", "error", "-i", output, "-vn", "-f", "s16le", "pipe:1"],
        { encoding: "buffer" },
      )
    ).stdout;
    assert.ok(pcm.every((v) => v === 0));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
