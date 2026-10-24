const test = require("node:test"),
  assert = require("node:assert/strict"),
  T = require("../src/model"),
  { renderProject } = require("../src/render"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile),
  b = {
    ffmpeg: require("ffmpeg-static"),
    ffprobe: require("ffprobe-static").path,
  };
test(
  "real short export includes animated off-centre framing and circular clip/nested masks",
  { timeout: 90000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-v4-export-"));
    try {
      const source = path.join(dir, "source.mp4"),
        out = path.join(dir, "out.mp4");
      await run(b.ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=160x90:r=10",
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
          id: "v",
          kind: "video",
          path: source,
          name: "Video",
          duration: 1,
          width: 160,
          height: 90,
        },
        { id: "e", kind: "effect", duration: 1, name: "Pixel" },
      ];
      const c = {
        id: "v",
        mediaId: "v",
        start: 0,
        track: 0,
        in: 0,
        out: 1,
        speed: 1,
        volume: 1,
        effect: {
          type: "blur",
          shape: "circle",
          strength: 30,
          x: 10,
          y: 10,
          width: 60,
          height: 60,
        },
        zoom: {
          from: 1,
          to: 2,
          x: 0.2,
          y: 0.7,
          keys: [
            { time: 0, scale: 1, x: 0.5, y: 0.5 },
            { time: 0.2, scale: 2, x: 0.2, y: 0.7 },
            { time: 0.8, scale: 2, x: 0.2, y: 0.7 },
            { time: 1, scale: 1, x: 0.5, y: 0.5 },
          ],
        },
      };
      c.attachments = [
        {
          id: "pixel",
          mediaId: "e",
          sourceIn: 0.1,
          sourceOut: 0.9,
          start: 0.1,
          in: 0,
          out: 0.8,
          speed: 1,
          volume: 0,
          effect: {
            type: "pixel",
            shape: "circle",
            strength: 80,
            x: 40,
            y: 40,
            width: 40,
            height: 40,
          },
        },
      ];
      p.clips = [c];
      const expanded = T.expanded(T.validate(p));
      await renderProject(
        expanded,
        out,
        {
          height: "original",
          fps: 10,
          quality: 75,
          encoder: "cpu",
          preset: "ultrafast",
          keyframeSeconds: 2,
        },
        b,
        () => {},
      );
      const probe = JSON.parse(
        (
          await run(b.ffprobe, [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            out,
          ])
        ).stdout,
      );
      assert.equal(probe.streams[0].width, 160);
      assert.ok(Number(probe.format.duration) >= 0.9);
      assert.ok((await fs.stat(out)).size > 1000);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
