const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  T = require("../src/model"),
  { renderProject, simpleClip } = require("../src/render"),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;

test(
  "blurred background follows the same sparse source cuts, covers the canvas and leaves a sharp foreground",
  { timeout: 60000 },
  async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "akhbar-background-blur-"),
    );
    try {
      const source = path.join(dir, "portrait.mp4");
      await run(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "nullsrc=s=90x160:r=10:d=6,format=rgb24,geq=r='if(mod(floor(X/2),2),80,0)':g='if(lt(N,30),0,160)':b='if(lt(N,30),220,0)',select='eq(n,0)+eq(n,30)+eq(n,59)'",
        "-fps_mode",
        "vfr",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv444p",
        "-g",
        "60",
        "-threads",
        "2",
        source,
      ]);
      const p = T.empty();
      p.canvasSize = { width: 320, height: 180 };
      p.media = [
        {
          id: "m",
          name: "portrait",
          kind: "video",
          path: source,
          duration: 6,
          width: 90,
          height: 160,
          hasAudio: false,
        },
      ];
      p.clips = [1, 4].map((at, i) => ({
        id: "c" + i,
        mediaId: "m",
        track: 0,
        start: i,
        in: at,
        out: at + 1,
        speed: 1,
        volume: 0,
        backgroundBlur: true,
        groupId: "joined",
      }));
      assert.equal(
        simpleClip({ ...p, clips: [p.clips[0]] }),
        null,
        "background must not be skipped by the plain-video optimization",
      );
      const out = path.join(dir, "background.mp4");
      await renderProject(
        T.validate(JSON.parse(JSON.stringify(p))),
        out,
        { height: "original", fps: 10, quality: 90, encoder: "cpu" },
        { ffmpeg, ffprobe },
      );
      for (const [i, time] of [0.3, 1.3].entries()) {
        const { stdout: frame } = await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-ss",
            String(time),
            "-i",
            out,
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "pipe:1",
          ],
          { encoding: "buffer" },
        );
        const pixel = (x) => [
          ...frame.subarray((40 * 320 + x) * 3, (40 * 320 + x) * 3 + 3),
        ];
        for (const x of [1, 20, 160, 300, 318]) {
          const rgb = pixel(x);
          assert.ok(
            i === 0 ? rgb[2] > 180 && rgb[1] < 35 : rgb[1] > 130 && rgb[2] < 35,
            "background and foreground must show the same retained source interval, including canvas edges",
          );
        }
        const variation = (start, end) => {
          let sum = 0;
          for (let x = start + 1; x < end; x++)
            sum += Math.abs(pixel(x)[0] - pixel(x - 1)[0]);
          return sum / (end - start - 1);
        };
        const foreground = variation(125, 195),
          background = variation(10, 75);
        assert.ok(
          foreground > 12,
          `foreground must retain the source pattern: ${foreground}`,
        );
        assert.ok(
          background < foreground * 0.4,
          `background must actually be blurred: ${background} vs ${foreground}`,
        );
      }
      for (const c of p.clips) delete c.backgroundBlur;
      const plain = path.join(dir, "plain.mp4");
      await renderProject(
        p,
        plain,
        { height: "original", fps: 10, quality: 90, encoder: "cpu" },
        { ffmpeg, ffprobe },
      );
      const { stdout } = await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-ss",
          "0.3",
          "-i",
          plain,
          "-frames:v",
          "1",
          "-vf",
          "crop=2:2:8:40,scale=1:1",
          "-pix_fmt",
          "rgb24",
          "-f",
          "rawvideo",
          "pipe:1",
        ],
        { encoding: "buffer" },
      );
      assert.ok(
        [...stdout].every((value) => value < 15),
        "without the optional effect, an empty lower layer stays black",
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);

test("background effect survives project roundtrip, splits and clipboard, and is not copied to detached audio", () => {
  const p = T.empty();
  p.media = [
    {
      id: "m",
      name: "video",
      kind: "video",
      path: "source.mp4",
      duration: 5,
      width: 90,
      height: 160,
      hasAudio: true,
    },
  ];
  p.clips = [
    {
      id: "c",
      mediaId: "m",
      track: 0,
      start: 0,
      in: 1,
      out: 3,
      speed: 1,
      volume: 1,
      backgroundBlur: true,
    },
  ];
  const saved = T.validate(JSON.parse(JSON.stringify(p)));
  T.split(saved.clips, ["c"], 1, () => "split");
  assert.ok(saved.clips.every((c) => c.backgroundBlur));
  const clipboard = T.copySelection(
    saved,
    saved.clips.map((c) => c.id),
  );
  let next = 0;
  const pasted = T.pasteSelection(
    saved,
    clipboard,
    5,
    0,
    () => "paste" + next++,
  );
  assert.ok(pasted.project.clips.every((c) => c.backgroundBlur));
  const detached = T.detachAudio(p, "c", () => "detached" + next++);
  assert.equal(
    detached.project.clips.find((c) => c.id === detached.audioId)
      .backgroundBlur,
    undefined,
  );
  assert.equal(
    detached.project.clips.find((c) => c.id === "c").backgroundBlur,
    true,
  );
  assert.throws(
    () =>
      T.validate({ ...p, clips: [{ ...p.clips[0], backgroundBlur: "yes" }] }),
    /Sfondo sfocato/,
  );
});
