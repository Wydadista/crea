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
  "soft background shadow follows the actual foreground after resizing and zoom, preserves sharp pixels and is absent without the effect",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-shadow-"));
    try {
      const files = {};
      for (const [id, size] of [
        ["portrait", "90x160"],
        ["base", "320x180"],
      ]) {
        files[id] = path.join(dir, id + ".mp4");
        await run(ffmpeg, [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `color=white:s=${size}:r=10`,
          "-t",
          "2",
          "-c:v",
          "libx264",
          "-threads",
          "2",
          files[id],
        ]);
      }
      for (const mode of ["normal", "resized", "zoom", "disabled"]) {
        const p = T.empty();
        p.canvasSize = { width: 320, height: 180 };
        T.addTrack(p);
        p.media = [
          {
            id: "portrait",
            name: "portrait",
            kind: "video",
            path: files.portrait,
            duration: 2,
            width: 90,
            height: 160,
            hasAudio: false,
          },
          {
            id: "base",
            name: "base",
            kind: "video",
            path: files.base,
            duration: 2,
            width: 320,
            height: 180,
            hasAudio: false,
          },
        ];
        const top = {
          id: "top",
          mediaId: "portrait",
          track: 1,
          start: 0,
          in: 0.5,
          out: 1.5,
          speed: 1,
          volume: 0,
          backgroundBlur: mode !== "disabled",
        };
        if (mode === "resized")
          top.layout = {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            content: { x: 20, y: 20, width: 40, height: 60 },
          };
        if (mode === "zoom") top.zoom = { from: 2, to: 2, x: 0.5, y: 0.5 };
        p.clips = [
          {
            id: "base",
            mediaId: "base",
            track: 0,
            start: 0,
            in: 0,
            out: 1,
            speed: 1,
            volume: 0,
          },
          top,
        ];
        const output = path.join(dir, mode + ".mp4");
        await renderProject(
          p,
          output,
          { height: "original", fps: 10, quality: 90, encoder: "cpu" },
          { ffmpeg, ffprobe },
        );
        const { stdout } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-ss",
            "0.4",
            "-i",
            output,
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
        const value = (x, y = 90) => stdout[(y * 320 + x) * 3],
          left = mode === "resized" ? 64 : mode === "zoom" ? 59 : 109,
          right = mode === "resized" ? 192 : mode === "zoom" ? 261 : 211;
        assert.ok(
          value(20) > 245 && value(300) > 245,
          mode + ": distant background must remain bright",
        );
        assert.ok(
          value(left + 12) > 245 && value(right - 12) > 245,
          mode + ": the foreground must stay unchanged",
        );
        if (mode === "disabled") {
          assert.ok(
            value(left - 3) > 245 && value(right + 3) > 245,
            "plain overlays must not gain a shadow",
          );
        } else {
          for (const [near, far] of [
            [left - 3, left - 12],
            [right + 3, right + 12],
          ]) {
            assert.ok(
              value(near) > 140 && value(near) < 240,
              `${mode}: visible soft shadow at ${near}: ${value(near)}`,
            );
            assert.ok(
              value(far) > value(near) + 8,
              mode + ": shadow must fade away from the edge",
            );
          }
          if (mode === "resized") {
            assert.ok(
              value(128, 33) < 240 && value(128, 147) < 240,
              "top and bottom shadows follow resized content too",
            );
            assert.ok(value(128, 20) > 245 && value(128, 160) > 245);
          }
        }
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
