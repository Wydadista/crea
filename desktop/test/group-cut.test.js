const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
let serial = 0;
const uid = () => `test-${++serial}`;
function fixture() {
  const p = T.empty();
  for (let i = 1; i < 10; i++) T.addTrack(p);
  p.media = ["video", "image", "audio"].map((kind, i) => ({
    id: `m${i}`,
    kind,
    path: `/${kind}`,
    name: kind,
    duration: 60,
  }));
  p.clips = [0, 1, 2].map((i) => ({
    id: `c${i}`,
    mediaId: "m0",
    sourceInstanceId: "source",
    track: 0,
    start: i * 10,
    in: i * 10,
    out: (i + 1) * 10,
    speed: 1,
    volume: 0.7,
  }));
  return p;
}
test("linked groups preserve overlaps, tracks and offsets during moves", () => {
  const p = fixture();
  p.clips[1].track = 3;
  p.clips[1].start = 4;
  p.clips[2].track = 8;
  p.clips[2].start = 7;
  const before = structuredClone(p.clips);
  T.linkSelected(
    p.clips,
    p.clips.map((c) => c.id),
    uid,
  );
  assert.deepEqual(
    p.clips.map(({ linkId, ...c }) => c),
    before,
  );
  assert.equal(new Set(p.clips.map((c) => c.linkId)).size, 1);
  assert.equal(T.move(p.clips, T.linkedIds(p.clips, ["c1"]), 5, 0, 10), true);
  assert.deepEqual(
    p.clips.map((c) => [c.start, c.track]),
    [
      [5, 0],
      [9, 3],
      [12, 8],
    ],
  );
});
test("joined trim rejects internal edges and restores hidden cuts after save and paste", () => {
  const p = fixture();
  T.groupSelected(
    p.clips,
    p.clips.map((c) => c.id),
    uid,
  );
  assert.throws(() => T.trimJoined(p, "c1", "left", 1), /confini interni/);
  assert.throws(() => T.trimJoined(p, "c1", "right", 1), /confini interni/);
  const short = T.trimJoined(p, "c0", "left", 15);
  assert.deepEqual(
    short.clips.map((c) => [c.id, c.start, c.in, c.out]),
    [
      ["c1", 15, 15, 20],
      ["c2", 20, 20, 30],
    ],
  );
  const restored = T.trimJoined(
    T.validate(JSON.parse(JSON.stringify(short))),
    "c1",
    "left",
    -15,
  );
  assert.deepEqual(
    restored.clips.map((c) => [c.id, c.start, c.in, c.out]),
    p.clips.map((c) => [c.id, c.start, c.in, c.out]),
  );
  const copy = T.pasteSelection(
    short,
    T.copySelection(
      short,
      short.clips.map((c) => c.id),
    ),
    40,
    1,
    uid,
  );
  const pasted = copy.project.clips.filter((c) => copy.ids.includes(c.id));
  const extended = T.trimJoined(copy.project, pasted[0].id, "left", -15);
  assert.deepEqual(
    extended.clips
      .filter((c) => c.groupId === pasted[0].groupId)
      .map((c) => [c.start, c.in, c.out, c.track]),
    [
      [25, 0, 10, 1],
      [35, 10, 20, 1],
      [45, 20, 30, 1],
    ],
  );
  const right = T.trimJoined(p, "c2", "right", -15);
  assert.deepEqual(
    right.clips.map((c) => [c.start, c.in, c.out]),
    [
      [0, 0, 10],
      [10, 10, 15],
    ],
  );
  assert.equal(T.trimJoined(right, "c1", "right", 15).clips.length, 3);
  assert.equal(p.clips.length, 3);
});
test("cut/paste preserves properties, remaps joins and links, and retains relative layout", () => {
  const p = fixture();
  p.clips[0].speed = 2;
  p.clips[0].voice = { noise: 0.4, level: 0.1 };
  p.clips[1].start = 5;
  T.groupSelected(p.clips, ["c0", "c1"], uid);
  T.linkSelected(p.clips, ["c0", "c1", "c2"], uid);
  const before = JSON.stringify(p),
    out = T.cutSelection(p, ["c0", "c1", "c2"]);
  assert.equal(JSON.stringify(p), before);
  assert.equal(out.project.clips.length, 0);
  const result = T.pasteSelection(
    out.project,
    out.clipboard,
    3,
    1,
    uid,
  ).project;
  for (let i = 0; i < 3; i++)
    for (const key of ["in", "out", "speed", "volume", "voice"])
      assert.deepEqual(result.clips[i][key], p.clips[i][key]);
  assert.deepEqual(
    result.clips.map((c) => [c.start, c.track]),
    [
      [3, 1],
      [8, 1],
      [23, 1],
    ],
  );
  assert.notEqual(result.clips[0].linkId, p.clips[0].linkId);
  assert.equal(result.clips[0].linkId, result.clips[2].linkId);
  assert.deepEqual(T.validate(JSON.parse(JSON.stringify(result))), result);
});
test("unselected split counts elements across all tracks, supports each media kind and avoids zero durations", () => {
  for (const mediaId of ["m0", "m1", "m2"]) {
    const p = fixture();
    p.clips = [{ ...p.clips[0], mediaId, track: 7 }];
    assert.deepEqual(T.splitTargets(p.clips, [], 5), ["c0"]);
    assert.equal(T.split(p.clips, T.splitTargets(p.clips, [], 5), 5, uid), 1);
    assert.deepEqual(
      p.clips.map((c) => T.duration(c)),
      [5, 5],
    );
    for (const time of [0, 5, 10])
      assert.deepEqual(T.splitTargets(p.clips, [], time), []);
  }
  const p = fixture();
  p.clips[1].track = 2;
  p.clips[1].start = 0;
  assert.throws(() => T.splitTargets(p.clips, [], 5), /Più elementi/);
  assert.deepEqual(T.splitTargets(p.clips, ["c0"], 5), ["c0"]);
  assert.deepEqual(T.splitTargets(p.clips, [], 45), []);
});

test("legacy cross-track groups reopen as links without changing placement", () => {
  const p = fixture();
  p.clips[0].groupId = p.clips[1].groupId = "old";
  p.clips[1].track = 2;
  const before = p.clips.map((c) => [c.start, c.track, c.in, c.out]);
  const reopened = T.validate(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(
    reopened.clips.map((c) => [c.start, c.track, c.in, c.out]),
    before,
  );
  assert.equal(reopened.clips[0].groupId, undefined);
  assert.equal(reopened.clips[0].linkId, reopened.clips[1].linkId);
  assert.equal(T.linkedIds(reopened.clips, ["c0"]).length, 2);
});

test("ambiguity counts even a second element just inside its boundary", () => {
  const p = fixture();
  p.clips[1].track = 1;
  p.clips[1].start = 4.99;
  assert.throws(() => T.splitTargets(p.clips, [], 5), /Più elementi/);
});

test("extending joined cuts after ungrouping never restores an old link", () => {
  const p = fixture();
  T.groupSelected(
    p.clips,
    p.clips.map((c) => c.id),
    uid,
  );
  T.linkSelected(
    p.clips,
    p.clips.map((c) => c.id),
    uid,
  );
  const short = T.trimJoined(p, "c0", "left", 15);
  short.clips.forEach((c) => delete c.linkId);
  const extended = T.trimJoined(short, "c1", "left", -15);
  assert.ok(extended.clips.every((c) => !c.linkId));
});
