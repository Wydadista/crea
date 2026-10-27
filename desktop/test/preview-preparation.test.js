const test = require("node:test"),
  assert = require("node:assert/strict");
const Batch = require("../src/preview-preparation");
test("preparation waits for every independent job, deduplicates shared thumbnails, and completes failed work without hanging", async () => {
  const states = [],
    finished = [];
  const b = new Batch(
    (s) => states.push(s),
    (s) => finished.push(s),
  );
  let video, audio;
  const vp = new Promise((r) => (video = r)),
    ap = new Promise((_r, j) => (audio = j));
  b.track("video", vp);
  b.track("video", vp);
  b.track("audio", ap);
  b.seal();
  b.report("audio", 20, "Riduzione del rumore");
  assert.equal(states.at(-1).percent, 10);
  video();
  await Promise.resolve();
  assert.equal(states.at(-1).percent, 60);
  assert.equal(finished.length, 0);
  audio(Error("Unreadable audio"));
  await Promise.resolve();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].percent, 100);
  assert.equal(finished[0].total, 2);
  assert.equal(finished[0].failed, 1);
  b.report("audio", 0);
  b.seal();
  assert.equal(finished.length, 1);
});
