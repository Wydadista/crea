const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-scrub-"));
  let app;
  try {
    const file = path.join(dir, "colors.mp4");
    execFileSync(require("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=960x540:r=12:d=6",
      "-f",
      "lavfi",
      "-i",
      "color=c=lime:s=960x540:r=12:d=6",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=960x540:r=12:d=6",
      "-filter_complex",
      "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "120",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
    app = await electron.launch({
      args: [path.resolve(__dirname, ".."), "--no-sandbox", "--disable-gpu"],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof seek === "function");
    await page.evaluate(async (file) => {
      await imported(await studio.importPaths([file]));
      addMedia(project.media[0].id, 0, 0);
      selection.clear();
      properties();
      seek(2);
    }, file);
    await page.waitForFunction(() => {
      const p = [...players.values()][0];
      return (
        p?.element.readyState >= 2 &&
        !p.element.seeking &&
        Math.abs(p.element.currentTime - 2) < 0.01
      );
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const result = await page.evaluate(async () => {
      const cv = document.getElementById("previewCanvas");
      const pixel = () =>
        [
          ...cv
            .getContext("2d")
            .getImageData(
              Math.floor(cv.width / 2),
              Math.floor(cv.height / 2),
              1,
              1,
            ).data,
        ].slice(0, 3);
      const samples = [],
        widths = [];
      let seekEvents = 0;
      const p = [...players.values()][0];
      p.element.addEventListener("seeking", () => seekEvents++);
      let pending = true;
      const monitor = () => {
        samples.push(pixel());
        widths.push(cv.width);
        if (pending) requestAnimationFrame(monitor);
      };
      monitor();
      for (let n = 0; n < 60; n++) {
        // Several pointer events between repaints: the last one must win.
        for (let k = 0; k < 12; k++)
          seek([2, 8, 14][Math.floor(n / 5) % 3] + k * 0.004, true);
        await new Promise(requestAnimationFrame);
      }
      seek(8.25, true);
      finishPreviewScrubbing();
      const deadline = performance.now() + 5000;
      while (
        (!p.seeker.atTarget || Math.abs(p.element.currentTime - 8.25) > 0.01) &&
        performance.now() < deadline
      )
        await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      pending = false;
      return {
        samples,
        seekEvents,
        widths,
        finalTime: p.element.currentTime,
        finalPixel: pixel(),
        finalWidth: cv.width,
        cache: !!p.lastFrame,
        pool: videoPool.size,
      };
    });
    assert.ok(result.samples.length >= 30);
    assert.equal(
      result.samples.filter((p) => Math.max(...p) < 20).length,
      0,
      "never replace a decoded image with black during scrubbing",
    );
    assert.ok(
      new Set(result.samples.map((p) => p.indexOf(Math.max(...p)))).size >= 2,
      "pictures update before release",
    );
    assert.ok(
      result.seekEvents < 720 / 3,
      "pointer bursts do not each trigger a seek",
    );
    assert.ok(Math.abs(result.finalTime - 8.25) < 0.01);
    assert.ok(result.finalPixel[1] > 180 && result.finalPixel[0] < 30);
    assert.ok(result.widths.includes(640));
    assert.equal(result.finalWidth, 960);
    assert.ok(result.cache);
    // Exercise the real playhead and ruler pointer handlers as well.
    const ruler = await page.locator("#ruler").boundingBox();
    const pixelsPerSecond = await page.evaluate(() => scale);
    await page.mouse.move(ruler.x + 8.25 * pixelsPerSecond, ruler.y + 8);
    await page.mouse.down();
    for (const at of [2, 8, 14, 8, 2]) {
      await page.mouse.move(ruler.x + at * pixelsPerSecond, ruler.y + 8);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        !scrubbingPreview &&
        [...players.values()].some(
          (p) =>
            p.seeker?.atTarget && Math.abs(p.element.currentTime - 2) < 0.02,
        ),
    );
    assert.ok(Math.abs((await page.evaluate(() => time)) - 2) < 0.02);
    await page.evaluate(() => play());
    await page.waitForFunction(() => playing && time > 2.2);
    await page.evaluate(() => pause());
    // Missing frames in a newly entered clip hold the visible composition.
    await page.evaluate(() => {
      const cv = document.getElementById("previewCanvas"),
        ctx = cv.getContext("2d");
      window.beforeHold = [...ctx.getImageData(100, 100, 1, 1).data];
      const p = players.get(project.clips[0].id);
      window.heldPlayer = p;
      players.set(project.clips[0].id, {
        kind: "video",
        element: { seeking: true, readyState: 1 },
      });
      draw();
      window.afterHold = [...ctx.getImageData(100, 100, 1, 1).data];
      players.set(project.clips[0].id, window.heldPlayer);
    });
    assert.deepEqual(
      await page.evaluate(() => afterHold),
      await page.evaluate(() => beforeHold),
    );
    // A real gap remains black; reaching the last seconds still works.
    await page.evaluate(() => {
      project.clips[0].start = 2;
      changed();
      seek(0.5);
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.ok(
      await page.evaluate(() => {
        const c = document.getElementById("previewCanvas");
        return [...c.getContext("2d").getImageData(100, 100, 1, 1).data]
          .slice(0, 3)
          .every((v) => v === 0);
      }),
    );
    await page.evaluate(() => seek(19.5));
    await page.waitForFunction(() =>
      [...players.values()].some(
        (p) => p.seeker?.atTarget && p.element.currentTime > 17.4,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        pass: true,
        displaySamples: result.samples.length,
        blackSamples: 0,
        seekEvents: result.seekEvents,
        pointerRequests: 721,
        finalSourceTime: result.finalTime,
        movingWidth: 640,
        restoredWidth: result.finalWidth,
        liveColorChanges: true,
        holdAndGap: true,
      }),
    );
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
