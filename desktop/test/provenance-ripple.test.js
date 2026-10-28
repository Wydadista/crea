const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
let serial = 0;
const uid = () => `new-${++serial}`;
function fixture() {
  const p = T.empty();
  T.addTrack(p);
  p.media = [
    {
      id: "media",
      kind: "video",
      name: "Originale",
      path: "/video.mp4",
      duration: 60,
    },
  ];
  p.clips = [
    {
      id: "previous",
      mediaId: "media",
      sourceInstanceId: "Y",
      start: 0,
      track: 0,
      in: 0,
      out: 2,
      speed: 1,
      volume: 0.6,
    },
    ...[0, 1, 2].map((i) => ({
      id: `x${i}`,
      mediaId: "media",
      sourceInstanceId: "X",
      start: 2 + i * 2,
      track: 0,
      in: i * 2,
      out: (i + 1) * 2,
      speed: 1,
      volume: 0.6,
    })),
    {
      id: "other-track",
      mediaId: "media",
      sourceInstanceId: "X",
      start: 2,
      track: 1,
      in: 0,
      out: 2,
      speed: 1,
      volume: 0.6,
    },
  ];
  return p;
}
test("left trimming joined segments reattaches on release without restoring cut source, with magnet on/off", () => {
  const p = fixture();
  T.groupSelected(p.clips, ["x0", "x1"], uid);
  const before = JSON.stringify(p);
  const off = T.trimJoined(p, "x0", "left", 1, false),
    on = T.trimJoined(p, "x0", "left", 1, true);
  assert.deepEqual(
    on.clips
      .filter((c) => c.sourceInstanceId === "X" && c.track === 0)
      .sort((a, b) => a.start - b.start)
      .map((c) => [c.start, c.in, c.out]),
    [
      [2, 1, 2],
      [3, 2, 4],
      [5, 4, 6],
    ],
  );
  assert.equal(off.clips.find((c) => c.id === "x0").start, 3);
  assert.equal(on.clips.find((c) => c.id === "previous").out, 2);
  assert.equal(on.clips.find((c) => c.id === "other-track").start, 2);
  assert.equal(JSON.stringify(p), before);
  // Existing delete-ripple remains independent and source cuts stay removed.
  const removed = T.deleteFamilySegments(on, ["x1"], true);
  assert.equal(removed.clips.find((c) => c.id === "x2").start, 3);
  assert.equal(removed.clips.find((c) => c.id === "x2").in, 4);
});
test("joined left trim can cross an internal cut, with source speed and following family respected", () => {
  const p = fixture();
  T.groupSelected(p.clips, ["x0", "x1", "x2"], uid);
  const trimmed = T.trimJoined(p, "x0", "left", 3, true);
  assert.deepEqual(
    trimmed.clips
      .filter((c) => c.groupId)
      .sort((a, b) => a.start - b.start)
      .map((c) => [c.start, c.in, c.out]),
    [
      [2, 3, 4],
      [3, 4, 6],
    ],
  );
  const fast = fixture();
  fast.clips = fast.clips.filter((c) => c.id !== "x2");
  for (const c of fast.clips.filter((c) => c.id.startsWith("x"))) {
    c.speed = 2;
    c.start = 2 + c.in / 2;
  }
  T.groupSelected(fast.clips, ["x0", "x1"], uid);
  const result = T.trimJoined(fast, "x0", "left", 0.5, true);
  assert.equal(result.clips.find((c) => c.id === "x0").start, 2);
  assert.equal(result.clips.find((c) => c.id === "x0").in, 1);
  assert.equal(result.clips.find((c) => c.id === "x1").start, 2.5);
});
test("ten cuts keep one origin colour through joins, links, paste, trim and disk roundtrip", () => {
  const p = fixture();
  p.clips = [
    { ...p.clips[1], start: 0, in: 0, out: 10 },
    { ...p.clips[0], track: 1, start: 0, out: 10 },
  ];
  const x = T.clipColor(p.clips[0]),
    y = T.clipColor(p.clips[1]);
  assert.notEqual(x, y);
  for (let time = 1; time < 10; time++)
    T.split(
      p.clips,
      p.clips.filter((c) => c.sourceInstanceId === "X").map((c) => c.id),
      time,
      uid,
    );
  assert.equal(p.clips.filter((c) => c.sourceInstanceId === "X").length, 10);
  assert.ok(
    p.clips
      .filter((c) => c.sourceInstanceId === "X")
      .every((c) => T.clipColor(c) === x),
  );
  T.groupSelected(
    p.clips,
    p.clips.filter((c) => c.sourceInstanceId === "X").map((c) => c.id),
    uid,
  );
  T.linkSelected(
    p.clips,
    p.clips.map((c) => c.id),
    uid,
  );
  assert.ok(
    p.clips
      .filter((c) => c.sourceInstanceId === "X")
      .every((c) => T.clipColor(c) === x),
  );
  assert.equal(T.clipColor(p.clips.find((c) => c.sourceInstanceId === "Y")), y);
  const copied = T.pasteSelection(
    p,
    T.copySelection(
      p,
      p.clips.map((c) => c.id),
    ),
    20,
    0,
    uid,
  );
  const added = copied.project.clips.filter((c) => copied.ids.includes(c.id));
  assert.deepEqual(
    added.map((c) => T.clipColor(c)),
    p.clips.map((c) => T.clipColor(c)),
  );
  const disk = T.validate(JSON.parse(JSON.stringify(copied.project)));
  assert.deepEqual(
    disk.clips.map((c) => T.clipColor(c)),
    copied.project.clips.map((c) => T.clipColor(c)),
  );
});

test("left shortening preserves a pre-existing gap to a different insertion, preserving removed content", () => {
  const p = fixture();
  for (const c of p.clips.filter(
    (c) => c.track === 0 && c.sourceInstanceId === "X",
  ))
    c.start += 0.75;
  const old = p.clips.find((c) => c.id === "x0");
  const trimmed = T.trimFamilySegment(
    p,
    old.id,
    { ...old, start: old.start + 0.5, in: 0.5 },
    true,
  );
  assert.equal(trimmed.clips.find((c) => c.id === "x0").start, 2.75);
  assert.equal(trimmed.clips.find((c) => c.id === "x0").in, 0.5);
  T.groupSelected(p.clips, ["x0", "x1"], uid);
  const joined = T.trimJoined(p, "x0", "left", 0.5, true);
  assert.equal(joined.clips.find((c) => c.id === "x0").start, 2.75);
  assert.equal(joined.clips.find((c) => c.id === "x0").in, 0.5);
});
test("blocked downstream ripple never reverses a valid left trim or moves a foreign clip", () => {
  const p = fixture();
  p.clips = p.clips.filter((c) => c.id !== "x1");
  p.clips.push({
    ...p.clips[0],
    id: "blocker",
    sourceInstanceId: "B",
    start: 4,
  });
  const old = p.clips.find((c) => c.id === "x0");
  const result = T.trimFamilySegment(
    p,
    "x0",
    { ...old, start: 3, in: 1 },
    true,
  );
  assert.deepEqual(
    [
      result.clips.find((c) => c.id === "x0").start,
      result.clips.find((c) => c.id === "x0").in,
    ],
    [2, 1],
  );
  assert.equal(result.clips.find((c) => c.id === "x2").start, 6);
  assert.equal(result.clips.find((c) => c.id === "blocker").start, 4);
});
