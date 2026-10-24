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
  "sparse VFR screen recordings keep the held source image and matching audio across cuts, effects and retiming",
  { timeout: 120000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-vfr-cuts-"));
    try {
      const source = path.join(dir, "screen.mp4"),
        image = path.join(dir, "overlay.png");
      await run(ffmpeg, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=red:s=160x90:r=1:d=10[r];color=blue:s=160x90:r=1:d=10[b];color=green:s=160x90:r=1:d=10[g];[r][b][g]concat=n=3:v=1:a=0,select='eq(n,0)+eq(n,10)+eq(n,20)+eq(n,29)'",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=600:sample_rate=48000:duration=10[a];sine=frequency=1200:sample_rate=48000:duration=10[b];sine=frequency=1800:sample_rate=48000:duration=10[c];[a][b][c]concat=n=3:v=0:a=1",
        "-fps_mode",
        "vfr",
        "-c:v",
        "libx264",
        "-g",
        "120",
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
      async function color(file, time) {
        const { stdout } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-ss",
            String(time),
            "-i",
            file,
            "-frames:v",
            "1",
            "-vf",
            "crop=20:20:60:40,scale=1:1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "pipe:1",
          ],
          { encoding: "buffer" },
        );
        return [...stdout];
      }
      async function tone(file, time) {
        const { stdout } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-ss",
            String(time),
            "-i",
            file,
            "-t",
            "0.2",
            "-vn",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-f",
            "f32le",
            "pipe:1",
          ],
          { encoding: "buffer" },
        );
        const n = stdout.length / 4;
        const score = (f) => {
          let re = 0,
            im = 0;
          for (let i = 0; i < n; i++) {
            const x = stdout.readFloatLE(i * 4),
              a = (2 * Math.PI * f * i) / 48000;
            re += x * Math.cos(a);
            im += x * Math.sin(a);
          }
          return re * re + im * im;
        };
        return [600, 1200, 1800].sort((a, b) => score(b) - score(a))[0];
      }
      const settings = {
        height: "original",
        fps: 12,
        quality: 80,
        encoder: "cpu",
      };
      for (const scenario of ["plain", "overlay", "speed", "denoise"]) {
        const speed = scenario === "speed" ? 2 : 1,
          p = T.empty();
        p.canvasSize = { width: 160, height: 90 };
        p.media = [
          {
            id: "m",
            name: "screen",
            kind: "video",
            path: source,
            duration: 30,
            width: 160,
            height: 90,
            hasAudio: true,
            audioChannels: 1,
          },
        ];
        p.clips = [4, 14, 24].map((at, i) => ({
          id: "c" + i,
          mediaId: "m",
          track: 0,
          start: (i * 4) / speed,
          in: at,
          out: at + 4,
          speed,
          volume: 1,
          mono: true,
          ...(scenario === "denoise"
            ? { voice: { noise: 0.5, level: 0 } }
            : {}),
        }));
        if (scenario === "overlay") {
          T.addTrack(p);
          p.media.push({
            id: "image",
            name: "overlay",
            kind: "image",
            path: image,
            duration: 5,
          });
          p.clips.push({
            id: "overlay",
            mediaId: "image",
            start: 0,
            track: 1,
            in: 0,
            out: 12,
            speed: 1,
            volume: 0,
            layout: { x: 90, y: 90, width: 10, height: 10 },
          });
        }
        const out = path.join(dir, scenario + ".mp4"),
          events = [];
        await renderProject(p, out, settings, { ffmpeg, ffprobe }, (e) =>
          events.push(e),
        );
        const colors = await Promise.all(
          [1, 5, 9].map((t) => color(out, t / speed)),
        );
        assert.ok(
          colors[0][0] > 200 && colors[0][1] < 20 && colors[0][2] < 20,
          scenario + ": the cut must keep red, never the later blue frame",
        );
        assert.ok(
          colors[1][2] > 200 && colors[1][0] < 20,
          scenario + ": the second source interval is blue",
        );
        assert.ok(
          colors[2][1] > 90 && colors[2][0] < 20 && colors[2][2] < 20,
          scenario + ": the last interval holds green until its end",
        );
        if (scenario !== "denoise")
          assert.deepEqual(
            await Promise.all([1, 5, 9].map((t) => tone(out, t / speed))),
            [600, 1200, 1800],
            scenario + ": audio and video must use the same source interval",
          );
        if (scenario === "plain") {
          assert.equal(events.at(-1).directIntervals, 3);
          assert.equal(events.at(-1).directPasses, 1);
          assert.equal(events.at(-1).compositedIntervals, 0);
        }
        if (scenario === "overlay")
          assert.equal(events.at(-1).compositedIntervals, 3);
        const probe = JSON.parse(
          (
            await run(ffprobe, [
              "-v",
              "quiet",
              "-show_format",
              "-of",
              "json",
              out,
            ])
          ).stdout,
        );
        assert.ok(Math.abs(Number(probe.format.duration) - 12 / speed) < 0.12);
      }
      // The single-clip path must also keep the frame held before the requested start.
      const p = T.empty();
      p.canvasSize = { width: 160, height: 90 };
      p.media = [
        {
          id: "m",
          name: "screen",
          kind: "video",
          path: source,
          duration: 30,
          width: 160,
          height: 90,
          hasAudio: true,
        },
      ];
      p.clips = [
        {
          id: "one",
          mediaId: "m",
          track: 0,
          start: 0,
          in: 4,
          out: 18,
          speed: 1,
          volume: 1,
        },
      ];
      const out = path.join(dir, "single.mp4");
      await renderProject(p, out, settings, { ffmpeg, ffprobe });
      assert.ok((await color(out, 1))[0] > 200);
      assert.ok((await color(out, 9))[2] > 200);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
