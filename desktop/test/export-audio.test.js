const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  { createAudioPipeline } = require("../src/export-audio"),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;

test(
  "continuous AAC starts before the video queue ends and preserves fractional sample boundaries and silence",
  { timeout: 20000 },
  async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "akhbar-parallel-audio-"),
    );
    let pipeline, timer;
    try {
      const noise = path.join(dir, "noise.nut"),
        silence = path.join(dir, "silence.nut"),
        output = path.join(dir, "audio.m4a");
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anoisesrc=r=48000:d=8:a=0.1",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        noise,
      ]);
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=48000:cl=stereo:d=0.02",
        "-c:a",
        "pcm_s16le",
        silence,
      ]);
      let signalProgress;
      const started = new Promise((resolve, reject) => {
        signalProgress = resolve;
        timer = setTimeout(
          () => reject(Error("AAC did not start before finish()")),
          8000,
        );
      });
      pipeline = createAudioPipeline(ffmpeg, output, undefined, (seconds) => {
        if (seconds > 0.1) signalProgress();
      });
      pipeline.enqueue(noise, 8 * 48000);
      await started; // Input is still open: more video segments have yet to finish.
      clearTimeout(timer);
      assert.ok(pipeline.seconds > 0.1);
      let samples = 8 * 48000,
        frames = 0;
      const ranges = [];
      for (let i = 0; i < 12; i++) {
        frames += [2, 3, 5, 7][i % 4];
        const end = 8 * 48000 + Math.round((frames * 48000) / 29),
          silent = i % 2 === 0;
        ranges.push({ start: samples, end, silent });
        pipeline.enqueue(silent ? silence : noise, end - samples);
        samples = end;
      }
      await pipeline.finish();
      const metadata = JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "quiet",
            "-show_streams",
            "-of",
            "json",
            output,
          ])
        ).stdout,
      );
      assert.equal(metadata.streams[0].codec_name, "aac");
      assert.ok(
        Math.abs(Number(metadata.streams[0].duration) - samples / 48000) <
          0.002,
      );
      assert.ok(Math.abs(Number(metadata.streams[0].start_time)) < 1 / 48000);
      const { stdout: pcm } = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-i",
          output,
          "-ac",
          "2",
          "-ar",
          "48000",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
      );
      assert.ok(pcm.length / 8 >= samples && pcm.length / 8 < samples + 1024);
      for (const range of ranges) {
        // AAC can ring around a transition; measure inside each sample interval.
        const margin = 600;
        let energy = 0;
        for (let i = range.start + margin; i < range.end - margin; i++)
          energy += pcm.readFloatLE(i * 8) ** 2;
        const rms = Math.sqrt(energy / (range.end - range.start - 2 * margin));
        assert.ok(
          range.silent ? rms < 0.004 : rms > 0.02,
          `audio sample range ${range.start}..${range.end} must ${range.silent ? "stay silent" : "retain sound"}`,
        );
      }
    } finally {
      clearTimeout(timer);
      await pipeline?.dispose();
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "background audio errors and cancellation reject without hanging",
  { timeout: 10000 },
  async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "akhbar-audio-failure-"),
    );
    let pipeline;
    try {
      pipeline = createAudioPipeline(ffmpeg, path.join(dir, "error.m4a"));
      pipeline.enqueue(path.join(dir, "missing.nut"), 48000);
      await assert.rejects(
        pipeline.finish(),
        /No such file|not found|opening input/i,
      );
      await pipeline.dispose();
      const controller = new AbortController();
      pipeline = createAudioPipeline(
        ffmpeg,
        path.join(dir, "cancelled.m4a"),
        controller.signal,
      );
      controller.abort();
      await assert.rejects(pipeline.finish(), /abort/i);
    } finally {
      await pipeline?.dispose();
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
