const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { recorderPresentation } = require("../src/recorder-window");

test("recorder keeps its topmost level across pause and meter ticks, respects minimize and does not steal focus", async () => {
  const w = new EventEmitter(),
    calls = [];
  let minimized = false;
  Object.assign(w, {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    isVisible: () => true,
    getBounds: () => ({ x: 1500, y: 900, width: 480, height: 64 }),
    getPosition: () => [1500, 900],
  });
  for (const method of [
    "setMinimumSize",
    "setSize",
    "setPosition",
    "setAlwaysOnTop",
    "moveTop",
    "focus",
    "show",
    "restore",
  ])
    w[method] = (...args) => calls.push([method, ...args]);
  const update = recorderPresentation(w, () => ({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  }));
  update({ active: false });
  update({ countdown: 2 });
  const transitions = calls.length;
  for (let i = 0; i < 100; i++)
    update({ active: true, paused: !!(i % 2), level: i / 100 });
  assert.equal(calls.length, transitions);
  assert.deepEqual(
    calls.filter((c) => c[0] === "setSize"),
    [
      ["setSize", 1080, 76, false],
      ["setSize", 480, 64, false],
    ],
  );
  assert.deepEqual(
    calls.find((c) => c[0] === "setAlwaysOnTop"),
    ["setAlwaysOnTop", true, "screen-saver"],
  );
  w.emit("blur");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(calls.at(-1)[0], "moveTop");
  const beforeMinimize = calls.length;
  minimized = true;
  w.emit("blur");
  await new Promise((r) => setTimeout(r, 100));
  update({ active: true, paused: true });
  assert.equal(calls.length, beforeMinimize);
  minimized = false;
  w.emit("restore");
  assert.equal(calls.at(-1)[0], "moveTop");
  update({ finishing: true });
  assert.equal(calls.filter((c) => c[0] === "setSize").length, 2);
  update({ active: false });
  assert.deepEqual(calls.at(-1), ["setAlwaysOnTop", false, "screen-saver"]);
  assert.ok(!calls.some((c) => ["focus", "show", "restore"].includes(c[0])));
  w.emit("closed");
});
