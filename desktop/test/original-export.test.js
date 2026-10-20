const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const { renderProject } = require("../src/render"),
  T = require("../src/model");
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
test("original export keeps exact even/odd project dimensions and resized visual geometry after save/reopen", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-original-"));
  try {
    const source = path.join(dir, "source.mp4");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=1536x864:r=12",
      "-t",
      "0.5",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      source,
    ]);
    for (const [width, height] of [
      [1536, 864],
      [1535, 863],
      [432, 768],
    ]) {
      const p = T.empty();
      p.canvasSize = { width, height };
      p.media = [
        {
          id: "m",
          name: "source",
          path: source,
          kind: "video",
          duration: 0.5,
          width: 1536,
          height: 864,
        },
      ];
      p.clips = [
        {
          id: "v",
          mediaId: "m",
          start: 0,
          track: 0,
          in: 0,
          out: 0.5,
          speed: 1,
          volume: 1,
          layout: {
            x: 25,
            y: 25,
            width: 50,
            height: 25,
            content: { x: 0, y: 0, width: 100, height: 100 },
          },
          aspectUnlocked: false,
        },
      ];
      const saved = path.join(dir, "project.creastudio");
      await fs.writeFile(saved, JSON.stringify(p));
      const reopened = T.validate(JSON.parse(await fs.readFile(saved, "utf8")));
      const output = path.join(dir, `${width}x${height}.mp4`);
      await renderProject(
        reopened,
        output,
        { height: "original", fps: 12, quality: 75 },
        { ffmpeg, ffprobe },
      );
      const meta = JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "error",
            "-show_streams",
            "-of",
            "json",
            output,
          ])
        ).stdout,
      ).streams.find((s) => s.codec_type === "video");
      assert.equal(meta.width, width);
      assert.equal(meta.height, height);
      const pix = async (x, y) =>
        (
          await run(
            ffmpeg,
            [
              "-v",
              "error",
              "-i",
              output,
              "-frames:v",
              "1",
              "-vf",
              `format=rgb24,crop=1:1:${x}:${y}`,
              "-pix_fmt",
              "rgb24",
              "-f",
              "rawvideo",
              "pipe:1",
            ],
            { encoding: "buffer" },
          )
        ).stdout;
      const center = await pix(
          Math.floor(width / 2),
          Math.floor(height * 0.35),
        ),
        outside = await pix(10, 10);
      assert.ok(center[0] > 180 && center[1] < 40 && center[2] < 40);
      assert.ok(outside.every((v) => v < 15));
      const edge = await pix(
        Math.floor(width * 0.26),
        Math.floor(height * 0.26),
      );
      assert.ok(edge[0] > 180 && edge[1] < 40);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
