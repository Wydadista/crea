const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const run = require("node:util").promisify(
    require("node:child_process").execFile,
  ),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path,
  T = require("../src/model"),
  { renderProject } = require("../src/render");
test(
  "exported stinger has four picture seconds, two seconds of music over the next story, no black tail and no marker graphics",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "akhbar-stinger-export-"),
    );
    try {
      const body = path.join(dir, "body.mp4"),
        news = path.join(dir, "news.mp4"),
        music = path.join(dir, "music.wav");
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=blue:s=160x90:r=10",
        "-t",
        "4",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        body,
      ]);
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=red:s=160x90:r=10",
        "-t",
        "6",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        news,
      ]);
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=6",
        "-ac",
        "2",
        music,
      ]);
      const p = T.empty();
      p.canvasSize = { width: 160, height: 90 };
      T.addTrack(p);
      p.media = [
        {
          id: "b",
          kind: "video",
          name: "body",
          path: body,
          duration: 4,
          hasAudio: false,
        },
        {
          id: "a",
          kind: "audio",
          name: "music",
          path: music,
          duration: 6,
          hasAudio: true,
        },
        {
          id: "n",
          kind: "video",
          name: "news",
          path: news,
          duration: 6,
          hasAudio: false,
        },
      ];
      const c = (id, m, out, track) => ({
        id,
        mediaId: m,
        out,
        in: 0,
        start: 0,
        track,
        speed: 1,
        volume: 1,
      });
      p.clips = [c("body", "b", 4, 0), c("music", "a", 6, 1)];
      const preset = T.makeStinger(p, ["body", "music"], "News");
      p.clips = [c("news", "n", 6, 0)];
      p.markers = [{ id: "m", name: "Invisible marker", time: 4 }];
      let id = 0;
      const q = T.insertStinger(p, preset, 0, 0, () => String(++id)).project;
      const output = path.join(dir, "out.mp4");
      await renderProject(
        q,
        output,
        { height: "original", fps: 10, quality: 70, encoder: "cpu" },
        { ffmpeg, ffprobe },
      );
      const { stdout } = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-i",
          output,
          "-an",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 8e6 },
      );
      const size = 160 * 90 * 3,
        frames = stdout.length / size;
      assert.equal(frames, 100);
      for (let f = 0; f < frames; f++)
        for (const pixel of [0, (45 * 160 + 80) * 3]) {
          const at = f * size + pixel,
            r = stdout[at],
            b = stdout[at + 2];
          if (f < 40)
            assert.ok(b > 200 && r < 40, `frame ${f}: stinger body lost`);
          else
            assert.ok(
              r > 200 && b < 40,
              `frame ${f}: black tail or marker rendered`,
            );
        }
      const { stdout: audio } = await run(
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
        { encoding: "buffer", maxBuffer: 3e6 },
      );
      function rms(t) {
        let sum = 0,
          n = 0;
        for (
          let i = Math.floor((t - 0.1) * 48000);
          i < Math.floor((t + 0.1) * 48000);
          i++
        ) {
          sum += audio.readFloatLE(i * 4) ** 2;
          n++;
        }
        return Math.sqrt(sum / n);
      }
      assert.ok(rms(4.5) > 0.05, "audio tail missing over next story");
      assert.ok(rms(6.5) < 0.001, "music continued beyond its six seconds");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
