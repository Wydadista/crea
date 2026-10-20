const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
const media = [
  { id: "v", name: "video", path: "/video.mp4", kind: "video", duration: 20 },
];
const clip = (id, start, track = 0, speed = 1) => ({
  id,
  mediaId: "v",
  start,
  track,
  speed,
  in: 2,
  out: 10,
  volume: 1,
});
test("speed-aware split preserves absolute placement, trim and track", () => {
  const clips = [clip("x", 3, 2, 2.4), clip("other", 15, 1)];
  assert.equal(
    T.split(clips, ["x"], 4, () => "right"),
    1,
  );
  assert.equal(clips[0].out, 4.4);
  assert.equal(clips[1].in, 4.4);
  assert.equal(clips[1].start, 4);
  assert.equal(clips[1].track, 2);
  assert.equal(clips[2].start, 15);
  assert.equal(T.total(clips), 23);
});
test("move/delete leave other clips in place, gaps and overlaps are allowed", () => {
  const clips = [clip("a", 0), clip("b", 10, 1), clip("c", 20, 2)];
  T.move(clips, ["b"], 2.37, 0);
  assert.ok(Math.abs(clips[1].start - 12.37) < 1e-9);
  assert.equal(clips[2].start, 20);
  clips.splice(0, 1);
  assert.ok(Math.abs(clips[0].start - 12.37) < 1e-9);
  assert.equal(clips[1].start, 20);
  assert.deepEqual(
    T.active(clips, 21).map((c) => c.id),
    ["c"],
  );
});
test("group move clamps all members together and keeps offsets", () => {
  const clips = [
    { ...clip("a", 2, 1), groupId: "g" },
    { ...clip("b", 5, 2), groupId: "g" },
  ];
  T.move(clips, ["a", "b"], -8, 2);
  assert.deepEqual(
    clips.map((c) => [c.start, c.track]),
    [
      [0, 1],
      [3, 2],
    ],
  );
  const blocks = T.groups([...clips, { ...clip("c", 8, 1), groupId: "g" }]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].members.length, 2);
});
test("version 1 migrates without moving original video/audio positions", () => {
  const old = {
    version: 1,
    media,
    clips: [
      { id: "a", mediaId: "v", in: 0, out: 2, volume: 1 },
      { id: "b", mediaId: "v", in: 3, out: 8, volume: 1 },
    ],
    music: [],
  };
  const p = T.validate(old);
  assert.equal(p.version, 2);
  assert.deepEqual(
    p.clips.map((c) => c.start),
    [0, 2],
  );
  assert.equal(old.version, 1);
});
test("validation accepts any media on any track; rejects bad speed/region/times", () => {
  const p = { version: 2, media, clips: [clip("x", 0, 2)] };
  assert.equal(T.validate(p), p);
  for (const bad of [
    { speed: 0 },
    { speed: NaN },
    { track: 3 },
    { in: -1 },
    { start: -1 },
    { out: 21 },
    {
      effect: {
        type: "blur",
        strength: 20,
        x: 80,
        y: 0,
        width: 40,
        height: 50,
      },
    },
  ])
    assert.throws(() =>
      T.validate({ ...p, clips: [{ ...p.clips[0], ...bad }] }),
    );
  assert.throws(() => T.validate({ ...p, clips: [null] }));
});
