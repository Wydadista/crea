const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
function montage(remove = false) {
  let p = T.empty();
  p.media = [
    { id: "a", name: "source", path: "/a.mp4", kind: "video", duration: 120 },
  ];
  p.clips = [
    {
      id: "root",
      sourceInstanceId: "instance-a",
      mediaId: "a",
      in: 0,
      out: 100,
      start: 0,
      track: 0,
      speed: 1,
      volume: 1,
    },
  ];
  p = T.retime(p, ["root"], 2.5);
  let id = 0;
  for (let i = 99; i > 0; i--)
    T.split(p.clips, ["root"], i / 2.5, () => String(++id));
  if (remove) p.clips = p.clips.filter((c, i) => i % 7 !== 3);
  return p;
}
test("100 cuts restore in order on one track; deleted source sections stay deleted and input is untouched", () => {
  const p = montage(true),
    snapshot = JSON.stringify(p),
    cuts = p.clips.map((c) => [c.id, c.in, c.out]);
  const restored = T.retime(p, T.familyIds(p, ["root"]), null);
  assert.equal(JSON.stringify(p), snapshot);
  assert.equal(restored.trackCount, 1);
  assert.deepEqual(
    restored.clips.map((c) => [c.id, c.in, c.out]),
    cuts,
  );
  for (let i = 0; i < restored.clips.length; i++) {
    const c = restored.clips[i];
    assert.equal(c.speed, 1);
    assert.equal(c.track, 0);
    if (i) {
      const prev = restored.clips[i - 1],
        gap =
          p.clips[i].start - p.clips[i - 1].start - T.duration(p.clips[i - 1]);
      assert.ok(
        Math.abs(c.start - prev.start - T.duration(prev) - Math.max(0, gap)) <
          1e-8,
      );
    }
  }
  assert.equal(T.overlaps(restored.clips), false);
});
test("foreign clips stay fixed; overflow uses one reusable track and keeps computed time", () => {
  const p = montage();
  p.media.push({
    id: "b",
    name: "foreign",
    path: "/b.mp4",
    kind: "video",
    duration: 20,
  });
  p.clips.push({
    id: "foreign",
    mediaId: "b",
    in: 0,
    out: 20,
    start: 40,
    track: 0,
    speed: 1,
    volume: 1,
  });
  const restored = T.retime(p, T.familyIds(p, ["root"]), 1);
  assert.equal(restored.trackCount, 2);
  assert.deepEqual(restored.clips.at(-1), p.clips.at(-1));
  restored.clips.slice(0, -1).forEach((c, i) => {
    assert.ok(Math.abs(c.start - i) < 1e-8);
    assert.equal(c.track, i >= 40 && i < 60 ? 1 : 0);
  });
  assert.equal(T.overlaps(restored.clips), false);
  const faster = T.retime(restored, T.familyIds(restored, ["root"]), 2.5);
  assert.ok(faster.clips.slice(0, -1).every((c) => c.track === 0));
});
test("reference before work acceleration persists; instances of the same media stay distinguishable", () => {
  let p = montage();
  p = T.retime(p, T.familyIds(p, ["root"]), null);
  p = T.retime(p, T.familyIds(p, ["root"]), 0.8);
  p = T.retime(p, T.familyIds(p, ["root"]), 2.5);
  p = JSON.parse(JSON.stringify(p));
  const restored = T.retime(p, T.familyIds(p, ["root"]), null);
  assert.ok(restored.clips.every((c) => c.speed === 0.8));
  p.clips.push({
    ...p.clips[0],
    id: "other",
    sourceInstanceId: "instance-b",
    start: 100,
  });
  assert.equal(T.familyIds(p, ["root"]).length, 100);
  const legacy = montage();
  for (const c of legacy.clips) {
    delete c.speedReference;
    delete c.workSpeedActive;
  }
  const fasterLegacy = T.retime(legacy, T.familyIds(legacy, ["root"]), 3);
  assert.ok(
    T.retime(
      fasterLegacy,
      T.familyIds(fasterLegacy, ["root"]),
      null,
    ).clips.every((c) => c.speed === 1),
  );
});
test("overflow limit fails atomically; ordinary edits still reject overlaps", () => {
  const p = montage();
  for (let t = 1; t < 128; t++) T.addTrack(p);
  p.media.push({
    id: "b",
    name: "foreign",
    path: "/b.mp4",
    kind: "video",
    duration: 120,
  });
  for (let t = 0; t < 128; t++)
    p.clips.push({
      id: "b" + t,
      mediaId: "b",
      track: t,
      start: 40,
      in: 0,
      out: 60,
      volume: 1,
      speed: 1,
    });
  T.validate(p);
  const saved = JSON.stringify(p);
  assert.throws(() => T.retime(p, T.familyIds(p, ["root"]), 1), /128/);
  assert.equal(JSON.stringify(p), saved);
  const bad = montage();
  bad.clips[0].speed = 1;
  assert.throws(() => T.validate(bad), /occupato/);
});
test("eight resize anchors preserve aspect by default; project resolution is stable and exact", () => {
  const b = { x: 10, y: 20, width: 60, height: 40 };
  for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    const r = T.resizeBox(b, h, 5, 3, true);
    assert.ok(Math.abs(r.width / r.height - 1.5) < 1e-8);
  }
  const free = T.resizeBox(b, "e", 10, 0, false);
  assert.equal(free.width, 70);
  assert.equal(free.height, 40);
  const p = T.empty();
  p.media = [
    { id: "a", kind: "video", width: 1536, height: 864 },
    { id: "b", kind: "video", width: 3840, height: 2160 },
  ];
  p.canvasSize = T.projectSize(p);
  assert.deepEqual(T.outputSize(p, "original"), { width: 1536, height: 864 });
  p.media.reverse();
  assert.deepEqual(T.outputSize(p, "original"), { width: 1536, height: 864 });
  const { encoding } = require("../src/render");
  assert.equal(
    encoding({ height: "original", quality: 75, fps: 30 }, p).width,
    1536,
  );
  p.canvasSize = { width: 1535, height: 863 };
  assert.equal(
    encoding({ height: "original", quality: 75, fps: 30 }, p).pixelFormat,
    "yuv444p",
  );
});
