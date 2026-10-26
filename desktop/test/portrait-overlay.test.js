const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  T = require("../src/model"),
  { renderProject } = require("../src/render"),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;

test(
  "portrait and landscape overlays reveal lower tracks in padding while actual black pixels, cuts, zoom and effects stay intact",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "akhbar-portrait-overlay-"),
    );
    try {
      const files = {};
      for (const [id, size, color, box] of [
        ["wide", "320x180", "red", false],
        ["portrait", "90x160", "blue", true],
        ["tall", "180x320", "red", false],
        ["landscape", "160x90", "blue", true],
      ]) {
        files[id] = path.join(dir, id + ".mp4");
        await run(ffmpeg, [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `color=${color}:s=${size}:r=10${box ? ",drawbox=x=iw*0.4:y=ih*0.4:w=iw*0.2:h=ih*0.2:color=black:t=fill" : ""}`,
          "-t",
          "3",
          "-c:v",
          "libx264",
          "-threads",
          "2",
          files[id],
        ]);
      }
      const red = (p) => p[0] > 180 && p[1] < 30 && p[2] < 30,
        blue = (p) => p[2] > 180 && p[0] < 30 && p[1] < 30,
        black = (p) => p.every((x) => x < 20);
      for (const scenario of [
        "plain",
        "zoom",
        "resize",
        "blur",
        "pixel-circle",
        "reverse",
        "alone",
        "background",
        "background-zoom",
      ]) {
        const reverse = scenario === "reverse",
          width = reverse ? 180 : 320,
          height = reverse ? 320 : 180,
          p = T.empty();
        p.canvasSize = { width, height };
        T.addTrack(p);
        p.media = [
          {
            id: "base",
            name: "base",
            kind: "video",
            path: files[reverse ? "tall" : "wide"],
            duration: 3,
            width,
            height,
            hasAudio: false,
          },
          {
            id: "top",
            name: "top",
            kind: "video",
            path: files[reverse ? "landscape" : "portrait"],
            duration: 3,
            width: reverse ? 160 : 90,
            height: reverse ? 90 : 160,
            hasAudio: false,
          },
        ];
        const base = {
            id: "base",
            mediaId: "base",
            track: 0,
            start: 0,
            in: 0,
            out: 3,
            speed: 1,
            volume: 0,
          },
          top = {
            id: "top",
            mediaId: "top",
            track: 1,
            start: 0.5,
            in: 1,
            out: 2,
            speed: 1,
            volume: 0,
          };
        const background = scenario.startsWith("background");
        if (background) top.backgroundBlur = true;
        if (scenario === "zoom" || scenario === "background-zoom")
          top.zoom = { from: 2, to: 2, x: 0.5, y: 0.5 };
        if (scenario === "resize")
          top.layout = {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            content: { x: 65, y: 10, width: 20, height: 80 },
          };
        if (["blur", "pixel-circle"].includes(scenario))
          top.effect = {
            type: scenario === "blur" ? "blur" : "pixel",
            shape: scenario === "blur" ? "rect" : "circle",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            strength: 10,
          };
        p.clips = scenario === "alone" || background ? [top] : [base, top];
        const out = path.join(dir, scenario + ".mp4");
        await renderProject(
          p,
          out,
          { height: "original", fps: 10, quality: 90, encoder: "cpu" },
          { ffmpeg, ffprobe },
        );
        async function frame(at) {
          const { stdout } = await run(
            ffmpeg,
            [
              "-v",
              "error",
              "-ss",
              String(at),
              "-i",
              out,
              "-frames:v",
              "1",
              "-pix_fmt",
              "rgb24",
              "-f",
              "rawvideo",
              "pipe:1",
            ],
            { encoding: "buffer" },
          );
          assert.equal(stdout.length, width * height * 3);
          return (x, y) => [
            ...stdout.subarray(
              (Math.floor(y * height) * width + Math.floor(x * width)) * 3,
              (Math.floor(y * height) * width + Math.floor(x * width)) * 3 + 3,
            ),
          ];
        }
        const pixel = await frame(1);
        for (const [x, y] of reverse
          ? [
              [0.5, 0.05],
              [0.5, 0.95],
            ]
          : [
              [0.05, 0.5],
              [0.95, 0.5],
            ])
          assert.ok(
            (background ? blue : scenario === "alone" ? black : red)(
              pixel(x, y),
            ),
            `${scenario}: empty padding must reveal the lower track, or the empty project background`,
          );
        assert.ok(
          blue(
            pixel(
              reverse ? 0.2 : scenario === "resize" ? 0.75 : 0.5,
              reverse ? 0.5 : 0.2,
            ),
          ),
          `${scenario}: the actual upper video stays visible`,
        );
        assert.ok(
          black(pixel(scenario === "resize" ? 0.75 : 0.5, 0.5)),
          `${scenario}: black recorded inside the source must remain opaque`,
        );
        if (scenario !== "alone" && !background) {
          assert.ok(
            red((await frame(0.2))(0.5, 0.5)),
            "before the overlay starts, only the lower track is visible",
          );
          assert.ok(
            red((await frame(1.8))(0.5, 0.5)),
            "the overlay ends at its trimmed timeline boundary",
          );
        }
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
