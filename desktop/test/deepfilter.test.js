const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
const { denoisedMedia } = require("../src/deepfilter");
test(
  "DeepFilterNet3 CPU processes audio and export, bypass preserves original, timing stays exact",
  { timeout: 90000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-df3-test-"));
    try {
      const file = path.join(dir, "noise.wav");
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=duration=1:sample_rate=48000:amplitude=.08",
        "-ac",
        "2",
        file,
      ]);
      const m = {
        id: "m",
        name: "audio",
        path: file,
        kind: "audio",
        duration: 1,
        hasAudio: true,
        audioChannels: 2,
      };
      assert.equal(
        await denoisedMedia({ voice: { noise: 0.5, bypass: true } }, m, ffmpeg),
        m,
      );
      const clean = await denoisedMedia({ voice: { noise: 0.5 } }, m, ffmpeg);
      assert.notEqual(clean.path, file);
      const probe = JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "quiet",
            "-show_streams",
            "-of",
            "json",
            clean.path,
          ])
        ).stdout,
      ).streams[0];
      assert.equal(probe.sample_rate, "48000");
      assert.equal(probe.channels, 2);
      assert.ok(Math.abs(Number(probe.duration) - 1) < 0.001);
      async function rms(p) {
        const { stdout } = await run(
          ffmpeg,
          ["-v", "error", "-i", p, "-f", "f32le", "pipe:1"],
          { encoding: "buffer", maxBuffer: 2e6 },
        );
        let sum = 0;
        for (let i = 0; i < stdout.length; i += 4)
          sum += stdout.readFloatLE(i) ** 2;
        return Math.sqrt(sum / (stdout.length / 4));
      }
      assert.ok((await rms(clean.path)) < (await rms(file)) * 0.6);
      const T = require("../src/model"),
        p = T.empty();
      p.media = [m];
      p.canvasSize = { width: 160, height: 90 };
      p.clips = [
        {
          id: "a",
          mediaId: "m",
          track: 0,
          start: 0,
          in: 0,
          out: 1,
          speed: 1,
          volume: 1,
          voice: { noise: 0.5, level: 0 },
        },
      ];
      const output = path.join(dir, "out.mp4");
      await require("../src/render").renderProject(
        p,
        output,
        { height: "original", fps: 10, quality: 70, encoder: "cpu" },
        { ffmpeg, ffprobe },
      );
      assert.ok((await fs.stat(output)).size > 0);
      assert.equal(p.media[0].path, file);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
