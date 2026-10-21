const test = require("node:test"),
  assert = require("node:assert/strict");
const T = require("../src/model");
global.Timeline = T;
require("../src/playback");
test("floating point residue at an audio cut never reaches AudioBufferSourceNode.start", async () => {
  const calls = [],
    noop = () => {};
  const context = {
    currentTime: 0,
    destination: {},
    resume: async () => {},
    createAnalyser: () => ({ connect: noop }),
    createGain: () => ({ gain: { value: 1 }, connect: noop, disconnect: noop }),
    createBufferSource: () => ({
      connect: noop,
      disconnect: noop,
      stop: noop,
      start: (when, offset, duration) => {
        assert.ok(offset >= 0);
        calls.push({ offset, duration });
      },
    }),
  };
  const transport = new AudioTransport(noop, context),
    c = { id: "c", start: 0, in: 0, out: 1, volume: 1 };
  transport.segments = () => [
    { c, m: {}, page: 0, start: 0, stop: 1, offset: -3.55271e-15 },
  ];
  transport.buffer = async () => ({ duration: 1 });
  try {
    await transport.start({ clips: [c] }, 0);
    assert.equal(calls[0].offset, 0);
    assert.equal(calls[0].duration, 1);
  } finally {
    transport.stop();
  }
});
test("inserting above a target preserves all clip times, mute states, heights and speed home tracks", () => {
  const p = T.empty();
  T.addTrack(p);
  p.trackHeights = [100, 180];
  p.trackMuted = [false, true];
  p.clips = [
    { id: "a", track: 0, start: 7 },
    { id: "b", track: 1, start: 13, speedHomeTrack: 1 },
  ];
  T.insertTrack(p, 1);
  assert.deepEqual(
    p.clips.map((c) => [c.start, c.track]),
    [
      [7, 0],
      [13, 2],
    ],
  );
  assert.equal(p.clips[1].speedHomeTrack, 2);
  assert.deepEqual(p.trackMuted, [false, false, true]);
  assert.deepEqual(p.trackHeights, [100, 100, 180]);
});
test("deleting a track preserves other clip times, mute states and speed references", () => {
  const p = T.empty();
  T.addTrack(p);
  T.addTrack(p);
  p.trackHeights = [100, 120, 160];
  p.trackMuted = [true, false, true];
  p.clips = [
    { id: "a", track: 0, start: 7 },
    { id: "b", track: 1, start: 9 },
    { id: "c", track: 2, start: 13, speedHomeTrack: 2 },
    { id: "d", track: 0, start: 20, speedHomeTrack: 1 },
  ];
  T.removeTrack(p, 1);
  assert.equal(p.trackCount, 2);
  assert.deepEqual(
    p.clips.map((c) => [c.id, c.track, c.start]),
    [
      ["a", 0, 7],
      ["c", 1, 13],
      ["d", 0, 20],
    ],
  );
  assert.deepEqual(p.trackHeights, [100, 160]);
  assert.deepEqual(p.trackMuted, [true, true]);
  assert.equal(p.clips[1].speedHomeTrack, 1);
  assert.equal(p.clips[2].speedHomeTrack, undefined);
  assert.throws(() => T.removeTrack(p, 9));
  T.removeTrack(p, 1);
  T.removeTrack(p, 0);
  assert.equal(p.trackCount, 1);
  assert.deepEqual(p.clips, []);
  assert.deepEqual(p.trackHeights, [100]);
});
