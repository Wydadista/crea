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
  "batched exports preserve every cut, reordered sparse images, silence, gain and boundaries between batches and compositions",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-batch-"));
    try {
      const source = path.join(dir, "source.mp4"),
        image = path.join(dir, "still.png");
      await run(ffmpeg, [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=red:s=160x90:r=12:d=3[r];color=blue:s=160x90:r=12:d=3[b];color=green:s=160x90:r=12:d=3[g];[r][b][g]concat=n=3:v=1:a=0,select='eq(n,0)+eq(n,36)+eq(n,72)+eq(n,107)'",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=600:sample_rate=48000:duration=3[a];sine=frequency=1200:sample_rate=48000:duration=3[b];sine=frequency=1800:sample_rate=48000:duration=3[c];[a][b][c]concat=n=3:v=0:a=1",
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
      const p = T.empty();
      p.canvasSize = { width: 320, height: 180 };
      T.addTrack(p);
      p.trackMuted[1] = true;
      p.media = [
        {
          id: "m",
          kind: "video",
          name: "source",
          path: source,
          duration: 9,
          width: 160,
          height: 90,
          hasAudio: true,
          audioChannels: 1,
        },
        {
          id: "i",
          kind: "image",
          name: "still",
          path: image,
          duration: 5,
          hasAudio: false,
        },
        // A distinct source with no audio stream, interleaved into the same batch.
        {
          id: "silent",
          kind: "video",
          name: "silent",
          path: path.join(dir, "silent.mp4"),
          duration: 9,
          width: 160,
          height: 90,
          hasAudio: false,
        },
      ];
      await run(ffmpeg, [
        "-v",
        "error",
        "-i",
        source,
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-an",
        p.media[2].path,
      ]);
      const expected = [],
        ranges = [];
      let frame = 0;
      const append = (color, frames, frequency = 0, volume = 0) => {
        ranges.push({ start: frame, frames, frequency, volume });
        expected.push(...Array(frames).fill(color));
        frame += frames;
      };
      for (let i = 0; i < 17; i++) {
        if (i === 10) {
          p.clips.push({
            id: "still",
            mediaId: "i",
            track: 0,
            start: frame / 12,
            in: 0,
            out: 0.5,
            volume: 0,
          });
          append("white", 6);
        }
        if (i === 12) append("black", 3);
        const n = i % 3,
          frames = [2, 5, 6, 8][i % 4],
          sourceTime = [1, 7, 4][n],
          track = i === 5 ? 1 : 0,
          muted = i === 7,
          noAudio = i === 9,
          volume = i % 2 ? 0.5 : 1;
        p.clips.push({
          id: "c" + i,
          mediaId: noAudio ? "silent" : "m",
          track,
          start: frame / 12,
          in: sourceTime,
          out: sourceTime + frames / 12,
          speed: 1,
          volume,
          mono: true,
          muted,
        });
        append(
          ["red", "green", "blue"][n],
          frames,
          muted || track === 1 || noAudio ? 0 : [600, 1800, 1200][n],
          volume,
        );
      }
      const output = path.join(dir, "out.mp4"),
        events = [];
      await fs.writeFile(output, "previous export");
      await renderProject(
        p,
        output,
        { height: "original", fps: 12, quality: 80, encoder: "cpu" },
        { ffmpeg, ffprobe },
        (e) => events.push(e),
      );
      const result = events.at(-1);
      assert.equal(result.directIntervals, 17);
      assert.equal(result.directPasses, 4);
      assert.equal(result.compositedIntervals, 2);
      assert.ok(
        result.stages.some(
          (stage) => stage.encoder === "aac" && stage.parallel,
        ),
      );
      assert.ok(
        events
          .filter((event) =>
            /Montaggio|Composizione|Blocco di/.test(event.message),
          )
          .every((event) => event.percent <= 90),
        "reserve progress for audio and MP4 finalization",
      );
      assert.ok(
        events.some(
          (event) =>
            event.message.startsWith("Assemblaggio MP4") &&
            event.percent >= 92 &&
            event.percent < 100,
        ),
      );
      const { stdout: pixels } = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-i",
          output,
          "-vf",
          "crop=20:20:(iw-ow)/2:(ih-oh)/2,scale=1:1",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
      );
      assert.equal(
        pixels.length / 3,
        expected.length,
        "no duplicate or missing video frames at any batch boundary",
      );
      for (let i = 0; i < expected.length; i++) {
        const [r, g, b] = pixels.subarray(i * 3, i * 3 + 3);
        const matches = {
          red: r > 200 && g < 20 && b < 20,
          blue: b > 200 && r < 20 && g < 20,
          green: g > 90 && r < 20 && b < 20,
          white: r > 220 && g > 220 && b > 220,
          black: r < 20 && g < 20 && b < 20,
        };
        assert.ok(
          matches[expected[i]],
          `frame ${i}: expected ${expected[i]}, got ${r},${g},${b}`,
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
          "-ar",
          "48000",
          "-ac",
          "2",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
      );
      for (const range of ranges) {
        const mid = (range.start + range.frames / 2) * 4000,
          samples = 2400,
          start = Math.round(mid - samples / 2);
        let energy = 0;
        const scores = [600, 1200, 1800].map((frequency) => {
          let re = 0,
            im = 0;
          for (let i = 0; i < samples; i++) {
            const x = audio.readFloatLE((start + i) * 8),
              angle = (2 * Math.PI * frequency * i) / 48000;
            if (frequency === 600) energy += x * x;
            re += x * Math.cos(angle);
            im += x * Math.sin(angle);
          }
          return { frequency, energy: re * re + im * im };
        });
        const rms = Math.sqrt(energy / samples);
        if (!range.frequency)
          assert.ok(
            rms < 0.004,
            "muted clips, missing audio and gaps stay silent",
          );
        else {
          assert.equal(
            scores.sort((a, b) => b.energy - a.energy)[0].frequency,
            range.frequency,
            "audio follows the same reordered cut as video",
          );
          assert.ok(
            Math.abs(rms - 0.088 * range.volume) < 0.012,
            `gain and mono at frame ${range.start}: RMS ${rms}, volume ${range.volume}`,
          );
        }
      }
      assert.ok(
        events.every(
          (event, i) => !i || event.percent >= events[i - 1].percent,
        ),
      );
      const metadata = JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "quiet",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            output,
          ])
        ).stdout,
      );
      assert.ok(Math.abs(Number(metadata.format.duration) - frame / 12) < 0.05);
      const video = metadata.streams.find((s) => s.codec_type === "video");
      assert.equal(video.r_frame_rate, "12/1");
      assert.equal(video.width, 320);
      assert.equal(video.height, 180);
      const controller = new AbortController(),
        cancelled = path.join(dir, "cancelled.mp4");
      await assert.rejects(
        renderProject(
          p,
          cancelled,
          { height: "original", fps: 12, quality: 80, encoder: "cpu" },
          { ffmpeg, ffprobe },
          (event) => {
            if (event.message.startsWith("Blocco di")) controller.abort();
          },
          controller.signal,
        ),
        /abort/i,
      );
      await assert.rejects(fs.access(cancelled));
      // Cancelling during assembly must preserve an existing destination and
      // remove both background audio work and the staged output beside it.
      const existing = path.join(dir, "existing.mp4"),
        sentinel = Buffer.from("existing export");
      await fs.writeFile(existing, sentinel);
      const assemblyController = new AbortController();
      await assert.rejects(
        renderProject(
          p,
          existing,
          { height: "original", fps: 12, quality: 80, encoder: "cpu" },
          { ffmpeg, ffprobe },
          (event) => {
            if (event.message.startsWith("Assemblaggio MP4 · copia"))
              assemblyController.abort();
          },
          assemblyController.signal,
        ),
        /abort/i,
      );
      assert.deepEqual(await fs.readFile(existing), sentinel);
      assert.ok(
        !(await fs.readdir(dir)).some((file) =>
          file.startsWith(".akhbar-export-"),
        ),
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
