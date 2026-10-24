const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function simulatedHardware() {
  const calls = [];
  const context = {
    module: { exports: {} },
    require(id) {
      if (id !== "node:child_process") return require(id);
      return {
        execFile(file, args, options, callback) {
          calls.push({ file, args, options });
          const source = args[args.indexOf("-i") + 1];
          const width = Number(source.match(/s=(\d+)x/)[1]);
          const encoder = args[args.indexOf("-c:v") + 1];
          const pixelFormat = args[args.indexOf("-pix_fmt") + 1];
          const supported =
            encoder === "h264_nvenc" &&
            width >= 145 &&
            pixelFormat === "yuv420p";
          callback(
            supported ? null : new Error("Unsupported encoding configuration"),
            "",
            "",
          );
        },
      };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../src/encoders"), "utf8"),
    context,
  );
  return { detect: context.module.exports.detect, calls };
}

test("detects NVENC when tiny test frames would reject a working encoder", async () => {
  const { detect, calls } = simulatedHardware();
  const result = await detect("ffmpeg.exe");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "h264_nvenc");
  assert.equal(result[0].label, "GPU NVIDIA");
  assert.equal(calls.length, 4);
});

test("validates requested export dimensions and pixel format before offering hardware", async () => {
  const { detect } = simulatedHardware();
  assert.equal(
    (await detect("ffmpeg.exe", { width: 1920, height: 1080 })).length,
    1,
  );
  assert.equal(
    (await detect("ffmpeg.exe", { width: 128, height: 128 })).length,
    0,
  );
  assert.equal(
    (
      await detect("ffmpeg.exe", {
        width: 1920,
        height: 1080,
        pixelFormat: "yuv444p",
      })
    ).length,
    0,
  );
});
