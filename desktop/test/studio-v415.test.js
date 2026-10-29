const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model");
function fixture() {
  const p = T.empty();
  p.trackCount = 3;
  p.trackHeights = [100, 100, 100];
  p.trackMuted = [false, false, false];
  p.media = [
    {
      id: "v",
      name: "video",
      kind: "video",
      path: "/v.mp4",
      duration: 100,
      hasAudio: true,
    },
  ];
  p.clips = [
    {
      id: "c",
      mediaId: "v",
      sourceInstanceId: "original",
      start: 20,
      track: 0,
      in: 10,
      out: 30,
      speed: 1,
      volume: 1,
    },
  ];
  return p;
}
test("markers follow exact source content through move, split, speed, trim, deletion and save", () => {
  const p = fixture(),
    m = T.anchorMarker({ id: "mark", name: "Frase" }, p.clips[0], 32);
  p.markers = [m];
  assert.equal(m.clipAnchor.sourceTime, 22);
  T.move(p.clips, ["c"], 5, 1, 3);
  assert.equal(T.markerTime(p, m), 37);
  T.split(p.clips, ["c"], 35, () => "right");
  assert.equal(T.markerClip(p, m).id, "right");
  assert.equal(T.markerTime(p, m), 37);
  const c = p.clips.find((c) => c.id === "right");
  c.speed = 2;
  assert.equal(T.markerTime(p, m), 36);
  c.in = 23;
  assert.equal(T.markerTime(p, m), null);
  c.in = 20;
  const reopened = T.validate(JSON.parse(JSON.stringify(p)));
  assert.equal(T.markerTime(reopened, reopened.markers[0]), 36);
  reopened.clips = [];
  assert.equal(T.markerTime(reopened, reopened.markers[0]), null);
  assert.throws(() =>
    T.validate({
      ...p,
      markers: [{ ...m, clipAnchor: { ...m.clipAnchor, sourceTime: NaN } }],
    }),
  );
});
test("marker cannot jump to another insertion of the same file", () => {
  const p = fixture(),
    m = T.anchorMarker({ id: "m", name: "Punto" }, p.clips[0], 25);
  p.clips = [{ ...p.clips[0], id: "other", sourceInstanceId: "other" }];
  assert.equal(T.markerTime(p, m), null);
});
test("freeze frame reuses upper lanes only if the full interval is free", () => {
  const p = fixture();
  assert.equal(T.freeOverlayTrack(p, 0, 25, 5), 1);
  p.clips.push({ ...p.clips[0], id: "occupied", track: 1, start: 28 });
  assert.equal(T.freeOverlayTrack(p, 0, 25, 5), 2);
  p.clips.push({ ...p.clips[0], id: "later", track: 2, start: 40 });
  assert.equal(T.freeOverlayTrack(p, 0, 25, 5), 2);
  p.clips[2].start = 25;
  assert.equal(T.freeOverlayTrack(p, 0, 25, 5), 3);
  p.clips[1].start = 30;
  assert.equal(T.freeOverlayTrack(p, 0, 25, 5), 1);
  p.trackCount = T.MAX_TRACKS;
  assert.equal(T.freeOverlayTrack(p, 0, 25, 5), 1);
  assert.throws(() => T.freeOverlayTrack(p, T.MAX_TRACKS - 1, 25, 5));
});
