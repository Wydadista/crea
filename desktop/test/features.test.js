const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const T = require("../src/model"),
  { renderProject, encoding } = require("../src/render");
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
const { audioFilters } = require("../src/audio");
test("snap joins precise opposite edges only; edits never ripple and groups retain independent clips", () => {
  const a = { id: "a", start: 1, track: 0, in: 0, out: 2, speed: 2 },
    b = { id: "b", start: 4, track: 0, in: 0, out: 1 };
  const origins = [{ c: b, start: b.start, track: b.track }];
  assert.equal(T.snap([a, b], origins, -1.95, 0, 0.1), -2);
  assert.equal(T.snap([a, b], origins, -1.8, 0, 0.1), -1.8);
  assert.equal(T.snap([a, b], origins, -1.95, 1, 0.1), -1.95);
  T.move([a, b], ["b"], -2);
  assert.equal(a.start, 1);
  assert.equal(b.start, 2);
  a.groupId = b.groupId = "g";
  assert.equal(T.groups([a, b]).length, 2);
  T.split([a, b], ["a"], 1.5, () => "split");
  assert.equal(b.start, 2);
  const levels = [35, 55, 75, 100].map((quality) =>
    encoding({ fps: 30, height: 1080, quality }),
  );
  assert.deepEqual(
    levels.map((c) => c.crf),
    [31, 26, 21, 14],
  );
  assert.ok(levels.every((c) => c.height === 1080 && c.width === 1920));
});
test("timed effects, duration progress, reversible mono/mute and CPU fallback survive JSON roundtrip", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-features-"));
  try {
    const source = path.join(dir, "source.mp4");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=12",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.3*sin(2*PI*440*t)|0:s=48000",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      source,
    ]);
    const media = {
      id: "m",
      path: source,
      name: "Source",
      kind: "video",
      hasAudio: true,
      duration: 3,
    };
    const c = {
      id: "v",
      mediaId: "m",
      start: 0,
      track: 0,
      in: 0,
      out: 3,
      speed: 1,
      volume: 1,
      mono: true,
      voice: { noise: 0.3, level: 0.4 },
    };
    assert.match(await audioFilters(c, media, ffmpeg), /c0=c0\|c1=c0/);
    let project = T.validate(
      JSON.parse(
        JSON.stringify({
          version: 2,
          media: [
            media,
            {
              id: "fx",
              name: "Blur",
              kind: "effect",
              duration: 1,
              hasAudio: false,
            },
          ],
          clips: [
            c,
            {
              id: "e",
              mediaId: "fx",
              start: 1,
              track: 1,
              in: 0,
              out: 1,
              volume: 0,
              effect: {
                type: "pixel",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                strength: 80,
              },
            },
          ],
          trackHeights: [80, 180, 100],
          trackMuted: [false, false, false],
        }),
      ),
    );
    const output = path.join(dir, "out.mp4"),
      progress = [];
    await renderProject(
      project,
      output,
      { height: 720, fps: 12, quality: 55, encoder: "h264_nvenc" },
      { ffmpeg, ffprobe },
      (p) => progress.push(p),
    );
    assert.equal(progress[0].percent, 0);
    assert.equal(progress.at(-1).percent, 100);
    assert.ok(progress.slice(0, -1).every((p) => p.percent < 100));
    assert.ok(
      progress.every((p, i) => !i || p.percent >= progress[i - 1].percent),
    );
    assert.ok(progress.some((p) => p.percent > 0 && p.percent < 49));
    await fs.access(output);
    const pcm = async (file) => {
      const { stdout } = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-i",
          file,
          "-vn",
          "-ac",
          "2",
          "-ar",
          "48000",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { encoding: "buffer", maxBuffer: 20e6 },
      );
      const rms = [0, 0];
      for (let i = 0; i < stdout.length; i += 4)
        rms[(i / 4) % 2] += stdout.readFloatLE(i) ** 2;
      return rms.map((v) => Math.sqrt(v / (stdout.length / 8)));
    };
    const rms = await pcm(output);
    assert.ok(rms[0] > 0.1);
    assert.ok(Math.abs(rms[0] - rms[1]) < 0.003);
    const frame = async (file, time) =>
      (
        await run(
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
            "scale=64:36",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
          ],
          { encoding: "buffer" },
        )
      ).stdout;
    // Compare against a control export with identical settings; only effect interval changes.
    project.clips = project.clips.filter((c) => c.id !== "e");
    const plain = path.join(dir, "plain.mp4");
    await renderProject(
      project,
      plain,
      { height: 720, fps: 12, quality: 55 },
      { ffmpeg, ffprobe },
    );
    const diff = (a, b) =>
      a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
    assert.ok(diff(await frame(output, 0.5), await frame(plain, 0.5)) < 5);
    assert.ok(diff(await frame(output, 1.5), await frame(plain, 1.5)) > 15);
    assert.ok(diff(await frame(output, 2.5), await frame(plain, 2.5)) < 5);
    for (const mode of ["clip", "track"]) {
      project.clips[0].muted = mode === "clip";
      project.trackMuted[0] = mode === "track";
      const muted = path.join(dir, mode + ".mp4");
      await renderProject(
        project,
        muted,
        { height: 720, fps: 12, quality: 35 },
        { ffmpeg, ffprobe },
      );
      assert.ok((await pcm(muted)).every((v) => v < 0.0001));
    }
    project.clips[0].muted = false;
    project.trackMuted[0] = false;
    project.clips[0].mono = false;
    const stereo = path.join(dir, "stereo.mp4");
    await renderProject(
      project,
      stereo,
      { height: 720, fps: 12, quality: 35 },
      { ffmpeg, ffprobe },
    );
    const original = await pcm(stereo);
    assert.ok(original[0] > 0.1 && original[1] < 0.002);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
