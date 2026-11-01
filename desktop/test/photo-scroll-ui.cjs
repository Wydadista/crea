const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  run = require("node:util").promisify(require("node:child_process").execFile),
  ffmpeg = require("ffmpeg-static");
(async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "akhbar-photo-scroll-ui-"),
  );
  let app;
  try {
    const photo = path.join(dir, "article.png");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=320x12000,drawbox=x=0:y=4000:w=320:h=4000:color=green:t=fill,drawbox=x=0:y=8000:w=320:h=4000:color=blue:t=fill",
      "-frames:v",
      "1",
      "-threads",
      "2",
      photo,
    ]);
    app = await _electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ":99",
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => typeof applyPhotoScrollFromGallery === "function",
    );
    await page.evaluate(async (file) => {
      await imported(await studio.importPaths([file]));
      const p = Timeline.empty();
      p.canvasSize = { width: 320, height: 180 };
      p.media = clone(project.media);
      p.clips = [
        {
          id: "article",
          mediaId: p.media[0].id,
          sourceInstanceId: "original",
          track: 0,
          start: 0,
          in: 0,
          out: 10,
          speed: 1,
          volume: 0,
        },
      ];
      applyOpened(p);
      selection = new Set(["article"]);
      previewFocus = "article";
      $("exportFps").value = 10;
      properties();
    }, photo);
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    await page.locator("#railElements").click();
    await page.locator("#addPhotoScroll").click();
    assert.deepEqual(
      await page.evaluate(() => clone(project.clips[0].photoScroll)),
      { from: 0, to: 1 },
    );
    assert.equal(await page.locator(".photo-scroll-effect").count(), 1);
    const current = async (t, channel) => {
      await page.evaluate((t) => seek(t, true), t);
      await page.waitForFunction((channel) => {
        const cv = $("previewCanvas"),
          ctx = cv.getContext("2d");
        const p = ctx.getImageData(
          Math.floor(cv.width * 0.12),
          Math.floor(cv.height * 0.5),
          1,
          1,
        ).data;
        return (
          p[channel] > (channel === 1 ? 80 : 200) &&
          [...p]
            .slice(0, 3)
            .filter((_, i) => i !== channel)
            .every((v) => v < 40)
        );
      }, channel);
    };
    await current(0, 0);
    await current(4.95, 1);
    await current(9.9, 2);
    assert.equal(
      await page.evaluate(() =>
        [...players.values()].some((p) => p.element.naturalHeight === 12000),
      ),
      true,
    );
    await page.evaluate(() => undo(history, future));
    assert.equal(
      await page.evaluate(() => !!project.clips[0].photoScroll),
      false,
    );
    await page.evaluate(() => undo(future, history));
    assert.equal(
      await page.evaluate(() => !!project.clips[0].photoScroll),
      true,
    );
    // Duration changes remain automatic, including a five-minute photo without rendering five minutes.
    await page.evaluate(() => {
      project.clips[0].out = 300;
      changed();
    });
    await current(0, 0);
    await current(150, 1);
    await current(299.9, 2);
    // Deleting only the effect from its timeline bar leaves the photo untouched.
    await page.locator(".photo-scroll-effect").click({ button: "right" });
    await page.locator("#effectContextMenu button").click();
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    assert.equal(
      await page.evaluate(() => !!project.clips[0].photoScroll),
      false,
    );
    await page.evaluate(() => {
      project.clips[0].out = 10;
      fitTimeline = true;
      time = 0;
      changed();
    });
    // The same gallery tile can be dragged onto an existing image.
    await page
      .locator("#addPhotoScroll")
      .dragTo(page.locator('.clip[data-id="article"]'));
    await page.waitForFunction(() => !!project.clips[0].photoScroll);
    await current(9.9, 2);
    // Splitting keeps the movement on both halves instead of starting at the top twice.
    await page.evaluate(() => {
      checkpoint();
      Timeline.split(project.clips, ["article"], 5, uid);
      changed();
    });
    await current(5, 1);
    await current(9.9, 2);
    assert.equal(
      await page.evaluate(() => project.clips.every((c) => !!c.photoScroll)),
      true,
    );
    await page.screenshot({ path: "/tmp/akhbar-photo-scroll-ui.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: gallery click and drag/drop, original 12,000px image, top/middle/bottom preview, five-minute timing, split continuity, undo/redo and effect-only removal",
    );
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
