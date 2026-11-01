const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  T = require("../src/model"),
  { renderProject } = require("../src/render"),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
function project(source = "image.png") {
  const p = T.empty();
  p.canvasSize = { width: 320, height: 180 };
  p.media = [
    {
      id: "m",
      name: "article.png",
      kind: "image",
      path: source,
      duration: 86400,
      width: 320,
      height: 12000,
      hasAudio: false,
    },
  ];
  p.clips = [
    {
      id: "c",
      mediaId: "m",
      track: 0,
      start: 0,
      in: 0,
      out: 2,
      speed: 1,
      volume: 0,
    },
  ];
  return p;
}
test("automatic original-image framing, duration, split, clipboard, joined ranges and validation", () => {
  const p = project(),
    c = p.clips[0];
  c.zoom = { from: 20, to: 20, x: 0.5, y: 0.5 };
  T.enablePhotoScroll(p, ["c"]);
  assert.equal(c.zoom, undefined);
  assert.deepEqual(T.photoScrollRect(c, 0, 320, 12000, 320, 180, 10), {
    x: 0,
    y: 0,
    width: 320,
    height: 180,
  });
  assert.equal(T.photoScrollRect(c, 1.9, 320, 12000, 320, 180, 10).y, 11820);
  c.out = 300;
  assert.equal(T.photoScrollPhase(c, 0, 10), 0);
  assert.equal(T.photoScrollPhase(c, 299.9, 10), 1);
  assert.ok(Math.abs(T.photoScrollPhase(c, 150, 10) - 0.5) < 0.001);
  c.out = 2;
  T.split(p.clips, ["c"], 1, () => "right");
  assert.equal(p.clips[0].photoScroll.to, 0.5);
  assert.equal(p.clips[1].photoScroll.from, 0.5);
  assert.equal(
    T.photoScrollPhase(p.clips[0], 0.9, 10),
    T.photoScrollPhase(p.clips[1], 1, 10),
  );
  p.clips.forEach((c) => (c.groupId = "joined"));
  T.enablePhotoScroll(
    p,
    p.clips.map((c) => c.id),
  );
  assert.equal(p.clips[0].photoScroll.to, 0.5);
  assert.equal(p.clips[1].photoScroll.to, 1);
  const saved = T.validate(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(saved.clips[0].photoScroll, p.clips[0].photoScroll);
  const clipboard = T.copySelection(p, ["c", "right"]);
  let id = 0;
  const pasted = T.pasteSelection(p, clipboard, 10, 0, () => `copy-${++id}`);
  assert.equal(
    pasted.project.clips
      .filter((c) => c.start >= 10)
      .every((c) => c.photoScroll),
    true,
  );
  T.disablePhotoScroll(p.clips);
  assert.equal(
    p.clips.some((c) => c.photoScroll),
    false,
  );
  assert.throws(() =>
    T.validate({
      ...saved,
      clips: saved.clips.map((c) => ({
        ...c,
        photoScroll: { from: 0, to: 2 },
      })),
    }),
  );
});
test(
  "real export reads sharp original pixels and reaches top, middle and bottom, including split/overlays",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "akhbar-photo-scroll-"),
    );
    try {
      const width = 320,
        height = 12000,
        pixels = Buffer.alloc(width * height * 3);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 3,
            channel = Math.min(2, Math.floor(y / (height / 3)));
          if (x >= 200) {
            const v = x % 4 < 2 ? 255 : 0;
            pixels[i] = v;
            pixels[i + 1] = v;
            pixels[i + 2] = v;
          } else pixels[i + channel] = 255;
        }
      const raw = path.join(dir, "article.ppm"),
        png = path.join(dir, "article.png");
      await fs.writeFile(
        raw,
        Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]),
      );
      await run(ffmpeg, [
        "-v",
        "error",
        "-i",
        raw,
        "-frames:v",
        "1",
        "-threads",
        "2",
        png,
      ]);
      for (const scenario of ["whole", "split", "offset"]) {
        const p = project(png);
        T.enablePhotoScroll(p, ["c"]);
        if (scenario === "split") T.split(p.clips, ["c"], 1, () => "right");
        const out = path.join(dir, scenario + ".mp4");
        // Use a silent audio lane to exercise composition interval offsets instead of a raster dependency.
        if (scenario === "offset") {
          T.addTrack(p);
          const audio = path.join(dir, "silent.wav");
          await run(ffmpeg, [
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=mono",
            "-t",
            "1",
            "-threads",
            "2",
            audio,
          ]);
          p.media.push({
            id: "a",
            name: "audio",
            kind: "audio",
            path: audio,
            duration: 1,
            hasAudio: true,
          });
          p.clips.push({
            id: "audio",
            mediaId: "a",
            track: 1,
            start: 0.5,
            in: 0,
            out: 1,
            speed: 1,
            volume: 1,
          });
        }
        await renderProject(
          T.validate(p),
          out,
          { height: "original", fps: 10, quality: 95, encoder: "cpu" },
          { ffmpeg, ffprobe },
        );
        const { stdout } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-i",
            out,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
          ],
          { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
        );
        assert.equal(stdout.length / (320 * 180 * 3), 20);
        const sample = (frame, x, y) => [
          ...stdout.subarray(
            ((frame * 180 + y) * 320 + x) * 3,
            ((frame * 180 + y) * 320 + x) * 3 + 3,
          ),
        ];
        for (const [frame, channel] of [
          [0, 0],
          [10, 1],
          [19, 2],
        ]) {
          const rgb = sample(frame, 40, 80);
          assert.ok(
            rgb[channel] > 210 &&
              rgb.filter((_, i) => i !== channel).every((v) => v < 35),
            `${scenario} frame ${frame}: ${rgb}`,
          );
        }
        let contrast = 0;
        for (let x = 202; x < 316; x++)
          contrast += Math.abs(sample(0, x, 40)[0] - sample(0, x - 1, 40)[0]);
        assert.ok(
          contrast / 114 > 85,
          `${scenario}: original 2-pixel lines must remain sharp`,
        );
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
