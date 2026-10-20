const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
const { renderProject } = require("../src/render");
const binaries = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path,
};
test(
  "real FFmpeg exports trimmed video + still + offset music into playable MP4",
  { timeout: 60000 },
  async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "crea-test-"));
    try {
      const video = path.join(temp, "source.mp4"),
        audio = path.join(temp, "music.wav"),
        image = path.join(temp, "still.png"),
        out = path.join(temp, "output.mp4");
      await run(binaries.ffmpeg, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x180:rate=25",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-t",
        "2",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-c:a",
        "aac",
        video,
      ]);
      await run(binaries.ffmpeg, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:sample_rate=48000",
        "-t",
        "2",
        audio,
      ]);
      await run(binaries.ffmpeg, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=320x180",
        "-frames:v",
        "1",
        image,
      ]);
      const p = {
        version: 1,
        media: [
          {
            id: "v",
            name: "Video",
            path: video,
            kind: "video",
            duration: 2,
            hasAudio: true,
          },
          {
            id: "i",
            name: "Image",
            path: image,
            kind: "image",
            duration: 5,
            hasAudio: false,
          },
          {
            id: "a",
            name: "Music",
            path: audio,
            kind: "audio",
            duration: 2,
            hasAudio: true,
          },
        ],
        clips: [
          { id: "1", mediaId: "v", in: 0.4, out: 1.4, volume: 0.5 },
          { id: "2", mediaId: "i", in: 0, out: 1, volume: 1 },
        ],
        music: [
          { id: "3", mediaId: "a", in: 0, out: 1.2, start: 0.3, volume: 0.4 },
        ],
      };
      const progress = [];
      await renderProject(
        p,
        out,
        { height: 720, fps: 30, quality: "small" },
        binaries,
        (p) => progress.push(p.percent),
      );
      const { stdout } = await run(binaries.ffprobe, [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        out,
      ]);
      const meta = JSON.parse(stdout);
      const v = meta.streams.find((s) => s.codec_type === "video"),
        a = meta.streams.find((s) => s.codec_type === "audio");
      assert.equal(v.width, 1280);
      assert.equal(v.height, 720);
      assert.equal(v.codec_name, "h264");
      assert.equal(a.codec_name, "aac");
      assert.equal(v.avg_frame_rate, "30/1");
      assert.ok(Math.abs(Number(meta.format.duration) - 2) < 0.2);
      assert.equal(progress.at(-1), 100);
      await run(binaries.ffmpeg, ["-v", "error", "-i", out, "-f", "null", "-"]);
      // A red still must survive concatenation as the final segment.
      const pixel = await run(
        binaries.ffmpeg,
        [
          "-v",
          "error",
          "-ss",
          "1.5",
          "-i",
          out,
          "-frames:v",
          "1",
          "-vf",
          "scale=1:1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "-",
        ],
        { encoding: "buffer" },
      );
      assert.ok(
        pixel.stdout[0] > 200 && pixel.stdout[1] < 40 && pixel.stdout[2] < 40,
      );
      const controller = new AbortController();
      controller.abort();
      const cancelled = path.join(temp, "cancelled.mp4");
      await assert.rejects(
        renderProject(
          p,
          cancelled,
          { height: 720, fps: 30, quality: "small" },
          binaries,
          () => {},
          controller.signal,
        ),
      );
      await assert.rejects(fs.access(cancelled));
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  },
);
