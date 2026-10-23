const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
const c = (id, start, family = "A", track = 0) => ({
  id,
  sourceInstanceId: family,
  mediaId: "m",
  start,
  track,
  in: 0,
  out: 2,
  speed: 1,
  volume: 0.7,
  mono: true,
});
const project = () => ({
  ...T.empty(),
  media: [
    {
      id: "m",
      path: "/original.mp4",
      name: "original",
      kind: "video",
      duration: 120,
    },
  ],
  clips: [],
});
let counter = 0;
const id = () => `new-${++counter}`;
test("copy/paste retains all source cuts and properties, relative time/tracks, and remaps insertion identities", () => {
  const p = project();
  T.addTrack(p);
  p.clips = [
    {
      ...c("a", 2),
      in: 3,
      out: 7,
      speed: 2,
      groupId: "g",
      voice: { noise: 0.2, level: 0.1 },
    },
    { ...c("b", 4), in: 7, out: 9, groupId: "g" },
    {
      ...c("text", 3, "T", 1),
      annotation: {
        type: "text",
        text: "Arabic العربية",
        font: "Arial",
        size: 32,
        color: "#ffffff",
        x: 50,
        y: 50,
        background: "#000000",
        backgroundEnabled: false,
        length: 30,
        angle: 0,
        lineWidth: 4,
        animate: 0,
      },
    },
  ];
  p.media.push({
    id: "text-media",
    name: "Text",
    kind: "annotation",
    duration: 2,
  });
  p.clips[2].mediaId = "text-media";
  const clip = T.copySelection(
      p,
      p.clips.map((c) => c.id),
    ),
    before = JSON.stringify(p),
    out = T.pasteSelection(p, clip, 12, 1, id);
  assert.equal(JSON.stringify(p), before);
  assert.equal(out.project.trackCount, 3);
  const added = out.project.clips.slice(3);
  assert.deepEqual(
    added.map((c) => [c.start, c.track]),
    [
      [12, 1],
      [14, 1],
      [13, 2],
    ],
  );
  for (let i = 0; i < 3; i++)
    for (const key of [
      "in",
      "out",
      "speed",
      "volume",
      "mono",
      "annotation",
      "voice",
    ])
      assert.deepEqual(added[i][key], p.clips[i][key]);
  assert.equal(added[0].sourceInstanceId, added[1].sourceInstanceId);
  assert.notEqual(added[0].sourceInstanceId, "A");
  assert.equal(added[0].groupId, added[1].groupId);
  assert.notEqual(added[0].groupId, "g");
  const second = T.pasteSelection(out.project, clip, 24, 0, id);
  assert.notEqual(
    second.project.clips[6].sourceInstanceId,
    added[0].sourceInstanceId,
  );
  assert.throws(
    () => T.pasteSelection(p, clip, 2, 0, id),
    /Spazio insufficiente/,
  );
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(
    T.validate(JSON.parse(JSON.stringify(out.project))).clips,
    out.project.clips,
  );
});
test("trim closure is source-speed aware, preserves selected cuts and affects only following insertion segments on the same track", () => {
  const p = project();
  T.addTrack(p);
  p.clips = [
    { ...c("a", 0), in: 0, out: 4, speed: 2 },
    { ...c("b", 2), in: 4, out: 8, speed: 2 },
    { ...c("c", 4), in: 8, out: 12, speed: 2 },
    c("independent", 8, "B"),
    c("other-track", 4, "A", 1),
  ];
  const before = JSON.stringify(p),
    trim = { ...p.clips[1], in: 5, start: 2.5 };
  const on = T.trimFamilySegment(p, "b", trim, true),
    off = T.trimFamilySegment(p, "b", trim, false);
  assert.deepEqual(
    on.clips.map((c) => c.start),
    [0, 2, 3.5, 8, 4],
  );
  assert.equal(on.clips[1].in, 5);
  assert.equal(on.clips[1].out, 8);
  assert.equal(on.clips[1].speed, 2);
  assert.deepEqual(
    off.clips.map((c) => c.start),
    [0, 2.5, 4, 8, 4],
  );
  const right = T.trimFamilySegment(p, "b", { ...p.clips[1], out: 7 }, true);
  assert.equal(right.clips[2].start, 3.5);
  assert.equal(right.clips[1].out, 7);
  assert.equal(JSON.stringify(p), before);
  const removed = T.deleteFamilySegments(p, ["b"], true);
  assert.deepEqual(
    removed.clips.map((c) => c.start),
    [0, 2, 8, 4],
  );
  const conflicting = project();
  conflicting.clips = [c("a", 0), c("b", 2), c("other", 4, "B"), c("c", 6)];
  const trimmed = T.trimFamilySegment(
    conflicting,
    "b",
    { ...conflicting.clips[1], out: 0.5 },
    true,
  );
  assert.equal(trimmed.clips.find((c) => c.id === "b").out, 0.5);
  assert.equal(trimmed.clips.find((c) => c.id === "c").start, 6);
  assert.equal(trimmed.clips.find((c) => c.id === "other").start, 4);
});
test("grouping partitions each inserted clip and actual gaps, including independent inserts of one media", () => {
  const p = project();
  for (const [j, family] of ["A", "B", "C"].entries())
    for (let i = 0; i < 10; i++)
      p.clips.push({
        ...c(`${family}${i}`, j * 10 + i, family),
        in: i,
        out: i + 1,
      });
  T.groupSelected(
    p.clips,
    p.clips.map((c) => c.id),
    id,
  );
  assert.equal(new Set(p.clips.map((c) => c.groupId)).size, 3);
  assert.ok(p.clips.every((c) => c.groupId));
  p.clips[5].start += 0.001;
  T.groupSelected(
    p.clips,
    p.clips.map((c) => c.id),
    id,
  );
  assert.notEqual(p.clips[4].groupId, p.clips[5].groupId);
  const legacy = [
    { ...c("legacy-a", 0), sourceInstanceId: undefined },
    { ...c("legacy-b", 2), sourceInstanceId: undefined },
  ];
  T.groupSelected(
    legacy,
    legacy.map((c) => c.id),
    id,
  );
  assert.ok(legacy.every((c) => !c.groupId));
  const one = [{ ...legacy[0], out: 4 }];
  T.split(one, ["legacy-a"], 2, id);
  assert.equal(one[0].sourceInstanceId, one[1].sourceInstanceId);
});
