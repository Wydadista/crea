const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
function fixture() {
  const p = T.empty();
  p.media = [
    { id: "m", name: "video", kind: "video", path: "/v", duration: 60 },
    { id: "e", name: "blur", kind: "effect", duration: 60 },
  ];
  p.clips = Array.from({ length: 10 }, (_, i) => ({
    id: "c" + i,
    mediaId: "m",
    start: i,
    track: 0,
    in: i % 2 ? 0 : 20,
    out: i % 2 ? 1 : 21,
    speed: 1,
    volume: 1,
    groupId: "join",
  }));
  return p;
}
test("one animation spans ten joined source cuts, survives save and split without restarts", () => {
  const p = fixture(),
    frames = [
      { time: 0, scale: 1, x: 0.5, y: 0.5 },
      { time: 2, scale: 8, x: 1, y: 0 },
      { time: 8, scale: 8, x: 1, y: 0 },
      { time: 10, scale: 1, x: 0.5, y: 0.5 },
    ];
  T.sequenceZoom(p.clips, p.clips[0], frames, "zoom");
  T.validate(p);
  const at = (t) => {
    const c = T.active(p.clips, t)[0];
    return T.zoomAt(c, T.sourceTime(c, t));
  };
  assert.equal(at(1).scale, 4.5);
  for (let t = 2; t < 8; t += 0.125) assert.equal(at(t).scale, 8);
  assert.equal(at(9).scale, 4.5);
  const old = JSON.stringify(p);
  T.split(p.clips, ["c4"], 4.5, () => "cut");
  assert.equal(at(4.6).scale, 8);
  T.validate(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(
    JSON.parse(old).clips[7].zoom,
    p.clips.find((c) => c.id === "c7").zoom,
  );
});
test("shared application becomes one uninterrupted effect even with unrelated source intervals", () => {
  const p = fixture();
  for (const c of p.clips)
    c.attachments = [
      {
        id: "fx" + c.id,
        applicationId: "shared",
        mediaId: "e",
        sourceIn: c.in - c.start,
        sourceOut: c.in + 10 - c.start,
        start: 0,
        in: 0,
        out: 10,
        speed: 1,
        volume: 0,
        effect: {
          type: "blur",
          strength: 20,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      },
    ];
  T.validate(p);
  const clips = T.expanded(p).clips.filter((c) => c.applicationId === "shared");
  assert.equal(clips.length, 1);
  assert.equal(clips[0].start, 0);
  assert.equal(T.duration(clips[0]), 10);
  const copy = T.pasteSelection(
    p,
    T.copySelection(
      p,
      p.clips.map((c) => c.id),
    ),
    20,
    0,
    (() => {
      let n = 0;
      return () => "copy" + ++n;
    })(),
  ).project;
  assert.equal(
    new Set(
      copy.clips
        .filter((c) => c.start >= 20)
        .map((c) => c.attachments[0].applicationId),
    ).size,
    1,
  );
  assert.notEqual(copy.clips.at(-1).attachments[0].applicationId, "shared");
});
test("moving an existing source segment inserts without duplication and leaves later clips intact", () => {
  const p = fixture();
  p.clips.forEach((c) => delete c.groupId);
  const result = T.moveInsert(p, ["c9"], 2, 0);
  assert.equal(result.clips.length, 10);
  assert.equal(result.clips.find((c) => c.id === "c9").start, 2);
  assert.equal(result.clips.find((c) => c.id === "c2").start, 3);
  assert.equal(p.clips[9].start, 9);
  assert.equal(T.overlaps(result.clips), false);
});
test("loading a 0.4.0 joined selection repairs repeated local zoom but preserves already continuous source keys", () => {
  const p = fixture();
  for (const c of p.clips)
    c.zoom = {
      from: 1,
      to: 3,
      x: 0.5,
      y: 0.5,
      keys: [
        { time: c.in, scale: 1, x: 0.5, y: 0.5 },
        { time: c.in + 0.25, scale: 3, x: 0.5, y: 0.5 },
        { time: c.in + 0.75, scale: 3, x: 0.5, y: 0.5 },
        { time: c.out, scale: 1, x: 0.5, y: 0.5 },
      ],
    };
  T.validate(p);
  const c = p.clips[4];
  assert.equal(T.zoomAt(c, c.in + 0.5).scale, 3);
  assert.ok(c.zoom.applicationId);
});
