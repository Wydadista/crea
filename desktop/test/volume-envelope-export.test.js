const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const run = require("node:util").promisify(
    require("node:child_process").execFile,
  ),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
const T = require("../src/model"),
  { renderProject } = require("../src/render");
test(
  "volume envelope is rendered at source times in direct, batched, composited and retimed exports, including zero base gain",
  { timeout: 90000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-envelope-"));
    try {
      const source = path.join(dir, "source.mp4"),
        image = path.join(dir, "image.png");
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=red:s=160x90:r=20",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=900:sample_rate=48000",
        "-t",
        "6",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-c:a",
        "aac",
        source,
      ]);
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=white:s=16x16",
        "-frames:v",
        "1",
        image,
      ]);
      const points = [
        { time: 1, value: 0 },
        { time: 2, value: 1 },
        { time: 3, value: 0 },
        { time: 4, value: 1 },
        { time: 5, value: 0 },
      ];
      const make = () => {
        const p = T.empty();
        p.canvasSize = { width: 160, height: 90 };
        p.media = [
          {
            id: "v",
            name: "video",
            kind: "video",
            path: source,
            duration: 6,
            hasAudio: true,
            audioChannels: 2,
          },
          {
            id: "img",
            name: "image",
            kind: "image",
            path: image,
            duration: 5,
            hasAudio: false,
          },
        ];
        p.clips = [
          {
            id: "v",
            mediaId: "v",
            start: 0,
            track: 0,
            in: 1,
            out: 5,
            speed: 1,
            volume: 0,
            volumePoints: structuredClone(points),
          },
        ];
        return p;
      };
      for (const mode of ["direct", "batch", "composite", "speed"]) {
        const p = make();
        if (mode === "batch") T.split(p.clips, ["v"], 2, () => "right");
        if (mode === "composite") {
          T.addTrack(p);
          p.clips.push({
            id: "img",
            mediaId: "img",
            start: 1.5,
            track: 1,
            in: 0,
            out: 1,
            speed: 1,
            volume: 1,
            layout: { x: 0, y: 0, width: 10, height: 10 },
          });
        }
        if (mode === "speed") p.clips[0].speed = 2;
        p.markers = [
          { id: "m", time: 0.5, name: "THIS MUST NEVER BE RENDERED" },
        ];
        const output = path.join(dir, mode + ".mp4");
        await renderProject(
          p,
          output,
          { height: "original", fps: 20, quality: 70, encoder: "cpu" },
          { ffmpeg, ffprobe },
        );
        const { stdout } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-i",
            output,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "48000",
            "-f",
            "f32le",
            "pipe:1",
          ],
          { encoding: "buffer", maxBuffer: 4e6 },
        );
        const speed = mode === "speed" ? 2 : 1;
        function rms(at) {
          let sum = 0,
            n = 0;
          const a = Math.floor((at - 0.035) * 48000),
            b = Math.floor((at + 0.035) * 48000);
          for (let i = a; i < b && i * 4 < stdout.length; i++) {
            sum += stdout.readFloatLE(i * 4) ** 2;
            n++;
          }
          return Math.sqrt(sum / n);
        }
        for (const base of [0, 2]) {
          const low = rms((base + 0.12) / speed),
            high = rms((base + 0.9) / speed);
          assert.ok(
            high > low * 3,
            `${mode}: volume ramp lost: low=${low}, high=${high}`,
          );
          assert.ok(high > 0.04, `${mode}: audio unexpectedly muted`);
        }
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
