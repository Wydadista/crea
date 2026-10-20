const { test } = require("node:test");
const assert = require("node:assert/strict");
const Timeline = require("../src/model");
const media = [
  { id: "v", name: "video", path: "/video.mp4", kind: "video", duration: 20 },
];
const clip = (id, a, b) => ({ id, mediaId: "v", in: a, out: b, volume: 1 });
test("split uses source trim and the playhead position in the whole sequence", () => {
  const clips = [clip("first", 0, 4), clip("second", 3, 12)];
  assert.equal(Timeline.split(clips, "second", 7, "new"), true);
  assert.deepEqual(
    clips.map((c) => [c.id, c.in, c.out]),
    [
      ["first", 0, 4],
      ["second", 3, 6],
      ["new", 6, 12],
    ],
  );
  assert.equal(Timeline.total(clips), 13);
  assert.deepEqual(Timeline.locate(clips, 7), {
    clip: clips[2],
    index: 2,
    start: 7,
    local: 6,
  });
});
test("split refuses edges and positions outside the selected clip", () => {
  const clips = [clip("first", 0, 4), clip("second", 0, 8)],
    before = JSON.stringify(clips);
  for (const t of [0, 4, 4.01, 12, 15])
    assert.equal(Timeline.split(clips, "second", t, "new"), false);
  assert.equal(JSON.stringify(clips), before);
});
test("project validation rejects missing media and invalid source intervals", () => {
  const p = { version: 1, media, clips: [clip("x", 1, 5)], music: [] };
  assert.equal(Timeline.validate(p), p);
  for (const props of [
    { mediaId: "missing" },
    { in: -1 },
    { out: 21 },
    { volume: NaN },
  ])
    assert.throws(() =>
      Timeline.validate({ ...p, clips: [{ ...p.clips[0], ...props }] }),
    );
  assert.throws(() =>
    Timeline.validate({
      ...p,
      music: [{ ...p.clips[0], id: "audio", start: 0 }],
    }),
  );
});
