const test = require("node:test"),
  assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { Recording } = require("../src/recording");

test("discard releases a capture write waiting for conversion backpressure", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-cancel-"));
  const r = new Recording("", dir, "", { format: "mp4" });
  const stdin = new Writable({
    highWaterMark: 1,
    write(_data, _encoding, _callback) {},
  });
  stdin.on("error", (e) => {
    r.error = e;
  });
  let closed = false,
    killed = false;
  r.handle = {
    write: async (data) => ({ bytesWritten: data.length }),
    close: async () => {
      closed = true;
    },
  };
  r.child = {
    stdin,
    exitCode: null,
    kill: () => {
      killed = true;
    },
  };
  r.done = Promise.resolve();
  const pending = r.append(Buffer.alloc(65536));
  const rejected = assert.rejects(pending, /interrotta/);
  await new Promise((resolve) => setImmediate(resolve));
  await r.dispose();
  await rejected;
  assert.ok(closed && killed && stdin.destroyed);
  assert.equal(r.handle, null);
  await assert.rejects(fs.stat(dir), { code: "ENOENT" });
});
