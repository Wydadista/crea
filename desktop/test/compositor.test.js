const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const run = require("node:util").promisify(
    require("node:child_process").execFile,
  ),
  { renderProject } = require("../src/render"),
  { waveform } = require("../src/waveform");
const b = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path,
};
const clip = (id, mediaId, start, track, out, extra = {}) => ({
  id,
  mediaId,
  start,
  track,
  in: 0,
  out,
  volume: 1,
  speed: 1,
  ...extra,
});
async function pixel(file, time, x = 640, y = 360) {
  const r = await run(
    b.ffmpeg,
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
      `crop=2:2:${x}:${y},scale=1:1`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { encoding: "buffer" },
  );
  return [...r.stdout];
}
const red = (p) => p[0] > 180 && p[1] < 60 && p[2] < 60,
  blue = (p) => p[2] > 180 && p[0] < 60 && p[1] < 60,
  green = (p) => p[1] > 80 && p[0] < 60 && p[2] < 60;
test(
  "three composited layers, gaps, 2x video, arbitrary 12 FPS and audio on video track",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-compose-"));
    try {
      const media = [];
      for (const [id, color] of [
        ["r", "red"],
        ["b", "blue"],
        ["g", "green"],
      ]) {
        const file = path.join(dir, id + ".mp4");
        await run(b.ffmpeg, [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          `color=c=${color}:s=320x180:r=24`,
          "-t",
          "3",
          "-c:v",
          "libx264",
          "-threads",
          "2",
          file,
        ]);
        media.push({
          id,
          name: id,
          path: file,
          kind: "video",
          duration: 3,
          hasAudio: false,
        });
      }
      const audio = path.join(dir, "audio.wav");
      await run(b.ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440",
        "-t",
        "3",
        audio,
      ]);
      media.push({
        id: "a",
        name: "music",
        path: audio,
        kind: "audio",
        duration: 3,
        hasAudio: true,
      });
      const p = {
          version: 2,
          media,
          clips: [
            clip("bottom", "r", 0.5, 0, 3),
            clip("top", "b", 1, 1, 2, {
              speed: 2,
              layout: { x: 25, y: 25, width: 50, height: 50 },
            }),
            clip("third", "g", 1.25, 2, 0.5, {
              layout: { x: 37.5, y: 37.5, width: 25, height: 25 },
            }),
            clip("music", "a", 0, 0, 3),
          ],
        },
        out = path.join(dir, "out.mp4");
      await renderProject(p, out, { height: 720, fps: 12, quality: 80 }, b);
      assert.ok(
        (await pixel(out, 0.2)).every((x) => x < 10),
        "gap stays black",
      );
      assert.ok(red(await pixel(out, 0.75)));
      assert.ok(blue(await pixel(out, 1.1)));
      assert.ok(green(await pixel(out, 1.5)));
      assert.ok(blue(await pixel(out, 1.9)));
      assert.ok(red(await pixel(out, 2.5)));
      assert.ok(
        red(await pixel(out, 1.5, 10, 10)),
        "bottom visible outside PiP",
      );
      const meta = JSON.parse(
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
      assert.equal(
        meta.streams.find((s) => s.codec_type === "video").avg_frame_rate,
        "12/1",
      );
      assert.ok(Math.abs(Number(meta.format.duration) - 3.5) < 0.15);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
test(
  "waveforms identify real silence in a video audio stream",
  { timeout: 30000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-wave-"));
    try {
      const file = path.join(dir, "voice.mp4");
      await run(b.ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=160x90:r=10",
        "-f",
        "lavfi",
        "-i",
        "aevalsrc=if(lt(t\\,0.5)\\,0.5*sin(2*PI*440*t)\\,0):s=48000",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-c:a",
        "aac",
        file,
      ]);
      const wave = await waveform(file, b.ffmpeg);
      assert.equal(wave.rate, 2000);
      assert.ok(wave.peaks.slice(200, 800).some((v) => v > 0.3));
      assert.ok(wave.peaks.slice(200, 800).some((v) => v < 0.25));
      assert.ok(
        wave.levelsOfDetail[1].peaks.slice(12, 48).every((v) => v > 0.3),
      );
      assert.ok(wave.peaks.slice(1400, 1800).every((v) => v === 0));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
test(
  "custom blur/pixel region and zoom are rendered, not just preview decorations",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-fx-"));
    try {
      const image = path.join(dir, "checker.png");
      await run(b.ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "nullsrc=s=320x180,geq=lum='if(mod(floor(X/4)+floor(Y/4),2),235,16)':cb=128:cr=128",
        "-frames:v",
        "1",
        image,
      ]);
      const m = {
        id: "i",
        path: image,
        name: "checker",
        kind: "image",
        duration: 5,
        hasAudio: false,
      };
      for (const type of ["blur", "pixel"]) {
        const p = {
            version: 2,
            media: [m],
            clips: [
              clip("i", "i", 0, 0, 1, {
                effect: {
                  type,
                  strength: 80,
                  x: 50,
                  y: 0,
                  width: 50,
                  height: 100,
                },
              }),
            ],
          },
          out = path.join(dir, type + ".mp4");
        await renderProject(p, out, { height: 720, fps: 10, quality: 95 }, b);
        const r = await run(
          b.ffmpeg,
          [
            "-v",
            "error",
            "-i",
            out,
            "-frames:v",
            "1",
            "-vf",
            "crop=1280:2:0:300",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
          ],
          { encoding: "buffer", maxBuffer: 100000 },
        );
        const bytes = r.stdout;
        const variability = (a, z) => {
          let sum = 0;
          for (let x = a; x < z; x++) sum += Math.abs(bytes[x * 3] - 128);
          return sum / (z - a);
        };
        assert.ok(variability(10, 600) > 70);
        assert.ok(
          variability(700, 1200) < 30,
          type + " affects only selected region",
        );
      }
      const halves = path.join(dir, "halves.png");
      await run(b.ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=red:s=320x180,drawbox=x=160:y=0:w=160:h=180:color=blue:t=fill",
        "-frames:v",
        "1",
        halves,
      ]);
      const out = path.join(dir, "zoom.mp4");
      await renderProject(
        {
          version: 2,
          media: [{ ...m, path: halves }],
          clips: [
            clip("z", "i", 0, 0, 1, { zoom: { from: 2, to: 2, x: 0, y: 0.5 } }),
          ],
        },
        out,
        { height: 720, fps: 10, quality: 90 },
        b,
      );
      assert.ok(red(await pixel(out, 0.5)), "zoom into left red half");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
