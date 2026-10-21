const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model"),
  Policy = require("../src/recording-policy"),
  Meter = require("../src/meter");
test("audio separation on a trimmed retimed clip transfers processing, preserves positions and rejects duplicate separation", () => {
  const p = T.empty();
  T.addTrack(p);
  p.media = [
    {
      id: "m",
      name: "Video",
      kind: "video",
      path: "/video.mp4",
      url: "file:///video.mp4",
      duration: 60,
      hasAudio: true,
      audioChannels: 2,
    },
  ];
  p.clips = [
    {
      id: "v",
      mediaId: "m",
      start: 3,
      in: 7,
      out: 15,
      track: 0,
      speed: 2,
      volume: 0.6,
      mono: true,
      voice: { noise: 0.2, level: 0, bypass: false },
      groupId: "g",
    },
    {
      id: "other",
      mediaId: "m",
      start: 20,
      in: 0,
      out: 1,
      track: 1,
      speed: 1,
      volume: 1,
    },
  ];
  const before = JSON.stringify(p);
  let id = 0;
  const { project: q, audioId } = T.detachAudio(p, "v", () => String(++id)),
    a = q.clips.find((c) => c.id === audioId),
    v = q.clips[0];
  assert.equal(JSON.stringify(p), before);
  assert.equal(a.track, 1);
  assert.equal(v.track, 0);
  assert.equal(q.clips[1].track, 2);
  assert.equal(q.clips[1].start, 20);
  for (const key of ["start", "in", "out", "speed", "volume", "mono", "voice"])
    assert.deepEqual(a[key], p.clips[0][key]);
  assert.equal(a.groupId, undefined);
  assert.equal(v.muted, true);
  assert.equal(v.audioDetached, true);
  assert.equal(q.media.find((m) => m.id === a.mediaId).kind, "audio");
  assert.throws(() => T.detachAudio(q, "v", () => String(++id)));
  assert.deepEqual(T.validate(JSON.parse(JSON.stringify(q))), q);
  q.trackHeights = [32, 32, 32];
  q.defaultTrackHeight = 32;
  T.validate(q);
  T.addTrack(q);
  assert.equal(q.trackHeights.at(-1), 32);
});
test("display dBFS meter is calibrated independently from audio gain, with fast attack and gradual release", () => {
  const samples = Float32Array.from(
      { length: 2048 },
      (_, i) => 0.04 * Math.sin((2 * Math.PI * i) / 64),
    ),
    copy = samples.slice(),
    m = new Meter.Envelope();
  let state;
  for (let i = 0; i < 30; i++) state = m.sample(samples, i * 33);
  assert.ok(Math.abs(state.rmsDb + 30.9691) < 0.02);
  assert.ok(state.level > 0.47 && state.level < 0.5);
  assert.deepEqual(samples, copy);
  const falling = m.sample(new Float32Array(2048), 1000);
  assert.ok(falling.level > 0 && falling.level < state.level);
  const peak = m.sample(Float32Array.of(0.99, -0.99), 1033);
  assert.equal(peak.status, "clip");
  assert.ok(peak.peakDb > -0.1);
  assert.equal(
    new Meter.Envelope().sample(new Float32Array(2048), 0).status,
    "low",
  );
});
test("capture fits once, never upscales, and the text bitrate uses real pixels and a non-lossless quality mapping", () => {
  assert.deepEqual(Policy.size(3840, 2160, 1080), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(Policy.size(1920, 1080, 2160), {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(Policy.size(1080, 1920, 1080), { width: 608, height: 1080 });
  const s = { quality: 100, fps: 12, profile: "balanced", format: "mp4" };
  assert.equal(Policy.bitrate(s, 1920, 1080), 4480000);
  assert.ok(
    Policy.bitrate({ ...s, profile: "screen-text" }, 1920, 1080) > 9000000,
  );
  assert.ok(Policy.fallbackCrf({ ...s, profile: "screen-text" }) > 0);
});

test("stereo meter does not under-read a single active channel or cancel opposite polarities", () => {
  const a = Float32Array.from(
      { length: 2048 },
      (_, i) => 0.04 * Math.sin((2 * Math.PI * i) / 64),
    ),
    silent = new Float32Array(2048),
    inverted = Float32Array.from(a, (v) => -v);
  const mono = new Meter.Envelope().sample(a, 0);
  assert.equal(new Meter.Envelope().sample([a, silent], 0).rmsDb, mono.rmsDb);
  assert.equal(new Meter.Envelope().sample([a, inverted], 0).rmsDb, mono.rmsDb);
});
