const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const T = require("../src/model"),
  { recordingDateName, reserveRecording } = require("../src/storage");
function fixture(kind = "image") {
  const p = T.empty();
  p.media = [
    {
      id: "m",
      name: kind,
      kind,
      path: "/asset",
      duration: 30,
      hasAudio: false,
    },
  ];
  p.clips = [
    {
      id: "c",
      mediaId: "m",
      sourceInstanceId: "source",
      track: 0,
      start: 4,
      in: 0,
      out: 2,
      speed: 1,
      volume: 0,
    },
  ];
  if (kind === "annotation")
    p.clips[0].annotation = {
      type: "text",
      text: "Titolo",
      font: "Arial",
      size: 32,
      color: "#ffffff",
      background: "#000000",
      backgroundEnabled: false,
      x: 50,
      y: 50,
      length: 30,
      angle: 0,
      lineWidth: 4,
      animate: 0,
    };
  if (kind === "effect")
    p.clips[0].effect = {
      type: "blur",
      strength: 10,
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      shape: "rect",
    };
  return p;
}
test("still images, text and effects extend left with a fixed right edge and collision protection", () => {
  for (const kind of ["image", "annotation", "effect"]) {
    const p = fixture(kind),
      q = T.trimFamilySegment(
        p,
        "c",
        { ...p.clips[0], start: 2, in: -2 },
        true,
      );
    assert.equal(q.clips[0].start, 2);
    assert.equal(T.duration(q.clips[0]), 4);
    assert.equal(q.clips[0].start + T.duration(q.clips[0]), 6);
    assert.equal(T.validate(JSON.parse(JSON.stringify(q))).clips[0].in, -2);
    p.clips.push({ ...p.clips[0], id: "blocker", start: 1, out: 2 });
    assert.throws(() =>
      T.trimFamilySegment(p, "c", { ...p.clips[0], start: 2, in: -2 }, false),
    );
  }
  for (const kind of ["video", "audio"]) {
    const p = fixture(kind);
    p.clips[0].in = -1;
    assert.throws(() => T.validate(p));
  }
  const p = fixture();
  p.clips[0].groupId = "joined";
  p.clips.push({ ...p.clips[0], id: "second", start: 6, in: 2, out: 4 });
  const q = T.trimJoined(p, "c", "left", -2);
  assert.equal(q.clips[0].start, 2);
  assert.equal(q.clips[0].in, -2);
  assert.equal(q.clips.find((c) => c.id === "second").start, 6);
  const restored = T.trimJoined(q, "c", "left", 1);
  assert.equal(restored.clips.find((c) => c.id === "second").start, 6);
});
test("one affine preview change preserves relative framing and does not mutate snapshots", () => {
  const before = {
      x: 10,
      y: 5,
      width: 80,
      height: 80,
      content: { x: 0, y: 0, width: 100, height: 100 },
    },
    ref = { x: 0, y: 0, width: 100, height: 100 },
    next = { x: -10, y: 0, width: 120, height: 120 };
  const result = T.transformLayout(before, ref, next);
  assert.deepEqual(result, {
    x: 2,
    y: 6,
    width: 96,
    height: 96,
    content: before.content,
  });
  assert.equal(before.width, 80);
  assert.notEqual(result.content, before.content);
  assert.deepEqual(T.transformLayout(undefined, undefined, next), next);
});
test("recordings use the local date and collision-safe daily numbers across formats/restarts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-daily-names-"));
  try {
    const day = recordingDateName(new Date(2026, 10, 4, 23, 59));
    assert.equal(day, "04-11-2026");
    for (const [i, ext] of ["mp4", "webm", "wav"].entries())
      assert.equal(
        path.basename(await reserveRecording(dir, day, ext)),
        `${day}-${i + 1}.${ext}`,
      );
    assert.equal(
      path.basename(
        await reserveRecording(
          dir,
          recordingDateName(new Date(2026, 10, 5)),
          "mp4",
        ),
      ),
      "05-11-2026-1.mp4",
    );
    const parallel = await Promise.all([
      reserveRecording(dir, day, "mp4"),
      reserveRecording(dir, day, "mp4"),
    ]);
    assert.equal(new Set(parallel).size, 2);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
