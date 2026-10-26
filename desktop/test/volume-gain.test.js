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
  "0–200% clip gain is audible in direct, batched and composited exports",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-volume-gain-"));
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
        "2",
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
      const make = () => {
        const p = T.empty();
        p.canvasSize = { width: 160, height: 90 };
        p.media = [
          {
            id: "v",
            name: "video",
            path: source,
            kind: "video",
            duration: 2,
            width: 160,
            height: 90,
            hasAudio: true,
          },
        ];
        return p;
      };
      async function rms(file, at) {
        const { stdout } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-ss",
            String(at),
            "-i",
            file,
            "-t",
            "0.15",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "48000",
            "-f",
            "f32le",
            "pipe:1",
          ],
          { encoding: "buffer" },
        );
        let sum = 0;
        for (let i = 0; i < stdout.length; i += 4)
          sum += stdout.readFloatLE(i) ** 2;
        return Math.sqrt(sum / (stdout.length / 4));
      }
      const settings = {
          height: "original",
          fps: 20,
          quality: 80,
          encoder: "cpu",
        },
        b = { ffmpeg, ffprobe };
      let reference;
      for (const gain of [1, 2, 0]) {
        const p = make();
        p.clips = [
          {
            id: "c",
            mediaId: "v",
            track: 0,
            start: 0,
            in: 0.2,
            out: 1.2,
            speed: 1,
            volume: gain,
          },
        ];
        const out = path.join(dir, `direct-${gain}.mp4`);
        await renderProject(p, out, settings, b);
        const level = await rms(out, 0.3);
        if (gain === 1) {
          reference = level;
          assert.ok(level > 0.06);
        } else if (gain === 0) assert.ok(level < 0.001);
        else assert.ok(Math.abs(level / reference - 2) < 0.08);
      }
      for (const mode of ["batch", "composition"]) {
        const p = make();
        p.clips = [0, 0.5, 1, 2].map((volume, i) => ({
          id: "c" + i,
          mediaId: "v",
          track: 0,
          start: i * 0.5,
          in: 0.2,
          out: 0.7,
          speed: 1,
          volume,
        }));
        if (mode === "composition") {
          T.addTrack(p);
          p.media.push({
            id: "i",
            name: "image",
            kind: "image",
            path: image,
            duration: 5,
            hasAudio: false,
          });
          p.clips.push({
            id: "image",
            mediaId: "i",
            track: 1,
            start: 0,
            in: 0,
            out: 2,
            speed: 1,
            volume: 0,
            layout: { x: 90, y: 0, width: 10, height: 10 },
          });
        }
        const out = path.join(dir, mode + ".mp4");
        await renderProject(p, out, settings, b);
        for (const [i, expected] of [0, 0.5, 1, 2].entries()) {
          const ratio = (await rms(out, i * 0.5 + 0.15)) / reference;
          assert.ok(
            Math.abs(ratio - expected) < 0.08,
            `${mode}: expected gain ${expected}, got ${ratio}`,
          );
        }
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);

test("boosted gain survives saves, cuts and clipboard without changing clip timing", () => {
  const p = T.empty();
  p.media = [
    {
      id: "m",
      kind: "audio",
      name: "audio",
      path: "source.wav",
      duration: 10,
      hasAudio: true,
    },
  ];
  p.clips = [
    {
      id: "c",
      mediaId: "m",
      start: 2,
      track: 0,
      in: 1,
      out: 5,
      speed: 2,
      volume: 1.75,
    },
  ];
  const saved = T.validate(JSON.parse(JSON.stringify(p)));
  T.split(saved.clips, ["c"], 3, () => "second");
  assert.deepEqual(
    saved.clips.map((c) => [c.start, c.in, c.out, c.speed, c.volume]),
    [
      [2, 1, 3, 2, 1.75],
      [3, 3, 5, 2, 1.75],
    ],
  );
  let id = 0;
  const result = T.pasteSelection(
    saved,
    T.copySelection(saved, ["c", "second"]),
    6,
    0,
    () => "p" + id++,
  );
  assert.ok(result.project.clips.every((c) => c.volume === 1.75));
  assert.throws(
    () => T.validate({ ...p, clips: [{ ...p.clips[0], volume: 2.01 }] }),
    /Clip non valida/,
  );
});
