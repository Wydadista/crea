const test = require("node:test"),
  assert = require("node:assert/strict");
const LatestVideoSeek = require("../src/preview");
function fixture() {
  const queue = new Map();
  let seq = 0;
  const clock = {
    requestAnimationFrame(fn) {
      queue.set(++seq, fn);
      return seq;
    },
    cancelAnimationFrame(id) {
      queue.delete(id);
    },
  };
  class Video extends EventTarget {
    readyState = 2;
    seeking = false;
    duration = 1800;
    at = 0;
    requests = [];
    get currentTime() {
      return this.at;
    }
    set currentTime(at) {
      assert.equal(this.seeking, false, "never overlap native seeks");
      this.requests.push(at);
      this.seeking = true;
      this.at = at;
      this.readyState = 1;
    }
    finish() {
      this.seeking = false;
      this.readyState = 2;
      this.dispatchEvent(new Event("seeked"));
    }
  }
  const video = new Video(),
    published = [],
    before = [];
  const seeker = new LatestVideoSeek(
    video,
    () => published.push(video.currentTime),
    clock,
    () => before.push(video.currentTime),
  );
  function frame() {
    const current = [...queue.values()];
    queue.clear();
    current.forEach((fn) => fn());
  }
  return { video, seeker, published, queue, frame, before };
}
test("pointer bursts coalesce into one seek and an in-flight seek retains only the latest destination", () => {
  const f = fixture();
  for (let n = 1; n <= 400; n++) f.seeker.request(n);
  assert.equal(f.queue.size, 1);
  f.frame();
  assert.deepEqual(f.video.requests, [400]);
  for (let n = 1; n <= 1200; n++) f.seeker.request(n);
  assert.equal(f.queue.size, 0);
  f.video.finish();
  assert.deepEqual(f.published, [400]);
  assert.equal(f.queue.size, 1);
  f.frame();
  assert.deepEqual(f.video.requests, [400, 1200]);
  assert.deepEqual(f.before, [0, 400]);
  f.video.finish();
  f.frame();
  assert.ok(f.seeker.atTarget);
  assert.equal(f.queue.size, 0);
});
test("metadata delay, rapid reversal and source bounds keep the final requested frame", () => {
  const f = fixture();
  f.video.readyState = 0;
  f.seeker.request(1500);
  f.seeker.request(23);
  assert.equal(f.queue.size, 0);
  f.video.readyState = 1;
  f.video.dispatchEvent(new Event("loadedmetadata"));
  f.frame();
  assert.deepEqual(f.video.requests, [23]);
  f.seeker.request(-1e-14);
  f.video.finish();
  f.frame();
  assert.equal(f.video.requests.at(-1), 0);
  f.video.finish();
  assert.ok(f.seeker.atTarget);
  f.seeker.request(2000);
  f.frame();
  assert.equal(f.video.requests.at(-1), 1799.9999);
  f.video.finish();
  assert.ok(f.seeker.atTarget);
});
test("disposing a player cancels pending work and ignores stale decoder events", () => {
  const f = fixture();
  f.seeker.request(300);
  f.seeker.dispose();
  f.frame();
  f.video.finish();
  f.seeker.request(400);
  assert.deepEqual(f.video.requests, []);
  assert.deepEqual(f.published, []);
  assert.equal(f.queue.size, 0);
});
