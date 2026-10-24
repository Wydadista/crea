const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
const frames = [
  { time: 0, scale: 1, x: 0.5, y: 0.5 },
  { time: 1, scale: 4, x: 1, y: 0 },
  { time: 7, scale: 4, x: 1, y: 0 },
  { time: 8, scale: 1, x: 0.5, y: 0.5 },
];
test("zoom durations stay fixed when the timeline interval changes and the hold adjusts automatically", () => {
  assert.deepEqual(
    T.zoomEnvelope(frames, 0, 8).map((k) => k.time),
    [0, 2, 6, 8],
  );
  assert.deepEqual(
    T.zoomEnvelope(frames, 1, 10, 2, 3).map((k) => k.time),
    [1, 3, 7, 10],
  );
  const short = T.zoomEnvelope(frames, 0, 2, 2, 2);
  assert.deepEqual(
    short.map((k) => k.time),
    [0, 1, 1, 2],
  );
  assert.deepEqual(
    T.zoomEnvelope(short, 0, 8, 2, 2).map((k) => k.time),
    [0, 2, 6, 8],
  );
  assert.equal(short[1].x, 1);
  assert.equal(short[2].scale, 4);
});
test("short zoom with no hold remains valid, continuous and reversible after JSON save", () => {
  const p = T.empty();
  p.media = [
    { id: "m", name: "image", kind: "image", path: "/image.png", duration: 2 },
  ];
  p.clips = [
    {
      id: "c",
      mediaId: "m",
      start: 0,
      track: 0,
      in: 0,
      out: 2,
      speed: 1,
      volume: 0,
    },
  ];
  T.sequenceZoom(p.clips, p.clips[0], T.zoomEnvelope(frames, 0, 2), "zoom", {
    entry: 2,
    exit: 2,
  });
  T.validate(p);
  const c = JSON.parse(JSON.stringify(p)).clips[0];
  assert.equal(T.zoomAt(c, 1).scale, 4);
  assert.equal(T.zoomAt(c, 2).scale, 1);
  assert.equal(T.zoomAt(c, 0.5).scale, T.zoomAt(c, 1.5).scale);
  assert.equal(c.zoom.entryDuration, 2);
  assert.throws(() => T.zoomEnvelope(frames, 0, 8, 0, 2), /Durate/);
});
