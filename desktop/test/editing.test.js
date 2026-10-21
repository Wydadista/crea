const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
const c = (id, start, out = 1, track = 0) => ({
  id,
  mediaId: "m",
  start,
  in: 0,
  out,
  track,
  speed: 1,
  volume: 1,
});
const project = () => ({
  ...T.empty(),
  media: [
    {
      id: "m",
      path: "/source.mp4",
      name: "video",
      kind: "video",
      duration: 120,
    },
  ],
  clips: [],
});
test("fast edge crossing, slight overshoot, release hysteresis and magnet off at all zooms", () => {
  for (const scale of [8, 16, 40, 137, 320, 640])
    for (const length of [0.1, 0.5, 3]) {
      const a = c("a", 0, 2),
        b = c("b", 5, length),
        clips = [a, b],
        origins = [{ c: b, start: b.start, track: 0 }];
      const delta = 2 - b.start - 22 / scale;
      const snapped = T.snapMove(clips, origins, delta, 0, {
        enabled: true,
        scale,
        previousDelta: 0,
      });
      assert.equal(snapped.delta, -3);
      assert.equal(snapped.latch.at, 2);
      assert.ok(T.canPlace(clips, [{ ...b, start: b.start + snapped.delta }]));
      const release = T.snapMove(clips, origins, 2 - b.start - 25 / scale, 0, {
        enabled: true,
        scale,
        previousDelta: delta,
        latch: snapped.latch,
      });
      assert.equal(release.delta, -3);
      assert.equal(
        T.snapMove(clips, origins, delta, 0, { enabled: false, scale }).delta,
        delta,
      );
      const distant = T.snapMove(clips, origins, 2 - b.start - 40 / scale, 0, {
        enabled: true,
        scale,
        previousDelta: 0,
      });
      assert.equal(distant.latch, null);
      assert.deepEqual(clips, [a, b]);
    }
});
test("snap never creates secondary overlaps or pulls clips on a different row", () => {
  const a = c("a", 0, 2),
    b = c("b", 5),
    d = c("d", 2.5),
    origins = [{ c: b, start: 5, track: 0 }];
  assert.equal(
    T.snapMove([a, b, d], origins, -3.1, 0, {
      enabled: true,
      scale: 40,
      previousDelta: 0,
    }).latch,
    null,
  );
  assert.equal(
    T.snapMove([a, b], origins, -3.1, 1, {
      enabled: true,
      scale: 40,
      previousDelta: 0,
    }).latch,
    null,
  );
});
test("only selected contiguous segments retime; other positions, source cuts and tracks are invariant", () => {
  const p = project();
  p.clips = Array.from({ length: 15 }, (_, i) => ({
    ...c(String(i), i, 4),
    in: i * 4,
    out: (i + 1) * 4,
    speed: 4,
    sourceInstanceId: "same",
  }));
  // Make room after the two selected segments; preserve a deleted portion of the source.
  for (let i = 9; i < 15; i++) p.clips[i].start += 8;
  p.clips[7].in += 0.4;
  const original = JSON.stringify(p),
    ids = ["7", "8"],
    next = T.retime(p, ids, null);
  assert.equal(JSON.stringify(p), original);
  assert.equal(next.clips[7].speed, 1);
  assert.equal(next.clips[8].speed, 1);
  assert.equal(next.clips[7].start, p.clips[7].start);
  assert.ok(
    Math.abs(
      next.clips[8].start -
        next.clips[7].start -
        T.duration(next.clips[7]) -
        0.1,
    ) < 1e-8,
  );
  next.clips.forEach((clip, i) => {
    assert.equal(clip.in, p.clips[i].in);
    assert.equal(clip.out, p.clips[i].out);
    assert.equal(clip.track, p.clips[i].track);
    if (!ids.includes(clip.id)) assert.deepEqual(clip, p.clips[i]);
  });
  const tight = project();
  tight.clips = [
    { ...c("a", 0, 4), speed: 4 },
    { ...c("b", 1, 4), speed: 4 },
  ];
  const before = JSON.stringify(tight);
  assert.throws(() => T.retime(tight, ["a"], null), /Spazio insufficiente/);
  assert.equal(JSON.stringify(tight), before);
});
test("groups split at real 0.1 s gaps and across rows; isolated clips remain independent", () => {
  const clips = [
    c("a", 0),
    c("b", 1),
    c("c", 2),
    c("d", 3.1),
    c("e", 4.1),
    c("f", 7),
  ];
  let i = 0;
  T.groupSelected(
    clips.map((c) => Object.assign(c, { sourceInstanceId: "insertion" })),
    clips.map((c) => c.id),
    () => String(++i),
  );
  assert.equal(clips[0].groupId, clips[2].groupId);
  assert.equal(clips[3].groupId, clips[4].groupId);
  assert.notEqual(clips[0].groupId, clips[3].groupId);
  assert.equal(clips[5].groupId, undefined);
  const before = clips.map((c) => [c.start, c.in, c.out, c.track]);
  clips[5].track = 1;
  T.groupSelected(clips, ["a", "f"], () => "cross", true);
  assert.equal(clips[0].groupId, clips[5].groupId);
  assert.deepEqual(
    clips.slice(0, 5).map((c) => [c.start, c.in, c.out, c.track]),
    before.slice(0, 5),
  );
});
test("ruler labels never overlap across intermediate zooms, scroll positions and widths", () => {
  const measure = (text) => text.length * 7;
  for (const width of [240, 500, 900, 1300])
    for (let scale = 0.1; scale <= 640; scale *= 1.24)
      for (const scroll of [0, 53, 10739, scale * 5400]) {
        const { labels } = T.rulerLabels(scale, scroll, width, measure);
        assert.ok(labels.length <= 8);
        for (let i = 1; i < labels.length; i++)
          assert.ok(
            (labels[i].time - labels[i - 1].time) * scale >=
              measure(labels[i - 1].text) + 16 - 1e-5,
          );
      }
});
