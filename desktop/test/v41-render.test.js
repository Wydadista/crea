const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  T = require("../src/model"),
  { renderProject } = require("../src/render");
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
test(
  "actual export keeps one zoom across a source reset in joined segments",
  { timeout: 90000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-joined-zoom-"));
    try {
      const source = path.join(dir, "bars.mp4"),
        out = path.join(dir, "out.mp4");
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "smptebars=s=160x90:r=10",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        source,
      ]);
      const p = T.empty();
      p.canvasSize = { width: 160, height: 90 };
      p.media = [
        {
          id: "m",
          name: "video",
          kind: "video",
          path: source,
          duration: 1,
          width: 160,
          height: 90,
        },
      ];
      p.clips = [0, 1].map((i) => ({
        id: "c" + i,
        mediaId: "m",
        track: 0,
        start: i,
        in: 0,
        out: 1,
        speed: 1,
        volume: 0,
        groupId: "join",
      }));
      T.sequenceZoom(
        p.clips,
        p.clips[0],
        [
          { time: 0, scale: 1, x: 0.5, y: 0.5 },
          { time: 0.5, scale: 3, x: 1, y: 0 },
          { time: 1.5, scale: 3, x: 1, y: 0 },
          { time: 2, scale: 1, x: 0.5, y: 0.5 },
        ],
        "motion",
      );
      await renderProject(
        p,
        out,
        { height: "original", fps: 10, quality: 90, encoder: "cpu" },
        { ffmpeg, ffprobe },
      );
      async function frame(t) {
        return (
          await run(
            ffmpeg,
            [
              "-v",
              "error",
              "-ss",
              String(t),
              "-i",
              out,
              "-frames:v",
              "1",
              "-pix_fmt",
              "gray",
              "-f",
              "rawvideo",
              "pipe:1",
            ],
            { encoding: "buffer", maxBuffer: 1e6 },
          )
        ).stdout;
      }
      const a = await frame(0.7),
        b = await frame(1.2),
        initial = await frame(0);
      const diff = (a, b) =>
        a.reduce((sum, x, i) => sum + Math.abs(x - b[i]), 0) / a.length;
      assert.ok(
        diff(a, b) < 3,
        "the hold framing must be identical on both sides of the cut",
      );
      assert.ok(
        diff(initial, a) > 10,
        "the test must actually zoom into a different framing",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
