const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-v42-"));
  let app;
  try {
    app = await _electron.launch({
      args: [path.resolve(__dirname, ".."), "--no-sandbox", "--disable-gpu"],
      env: { ...process.env, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => typeof applyZoomFromGallery === "function",
    );
    await page.evaluate(
      async (file) => {
        await imported(await studio.importPaths([file]));
        const m = project.media[0];
        m.duration = 20;
        addMedia(m.id, 0, 0);
        project.clips[0].out = 8;
        const id = project.clips[0].id;
        Timeline.split(project.clips, [id], 4, uid);
        selection = new Set(project.clips.map((c) => c.id));
        joinSelected();
      },
      path.resolve(__dirname, "../../miologo.png"),
    );
    const artwork = await page.locator(".brand-icon.app-logo").evaluateAll(images => images.map(img => ({loaded:img.complete && img.naturalWidth === 32,source:img.getAttribute("src")})));
    assert.ok(artwork.length >= 2 && artwork.every(img => img.loaded && img.source === "project-icon.png"));
    await page.locator("#railElements").click();
    assert.ok(await page.locator("#addZoom").isVisible());
    assert.ok(await page.locator("#addDenoise").isVisible());
    await page.locator("#addZoom").click();
    assert.equal(await page.locator("#zoomEntryDuration").inputValue(), "2");
    assert.equal(await page.locator("#zoomExitDuration").inputValue(), "2");
    assert.deepEqual(
      await page.evaluate(() =>
        sequenceFrames(sequenceScope()).map((k) => k.time),
      ),
      [0, 2, 6, 8],
    );
    assert.equal(
      await page
        .locator("#motionStart,#motionEnter,#motionHold,#motionEnd")
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator(
          ".properties #groupBtn,.properties #groupAcrossTracks,.properties #ungroupBtn,.properties #unjoinBtn",
        )
        .count(),
      0,
    );
    assert.ok(await page.locator("#groupTool").isVisible());
    assert.ok(await page.locator("#linkTool").isVisible());
    assert.equal(
      await page
        .locator(".clip.group")
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth),
      "2px",
    );
    assert.equal(
      await page
        .locator(".clip.group")
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopColor),
      "rgb(255, 200, 46)",
    );
    await page.locator("#zoomEntryDuration").fill("1");
    await page.locator("#zoomExitDuration").fill("3");
    await page.locator("#applyMotion").click();
    assert.deepEqual(
      await page.evaluate(() =>
        sequenceFrames(sequenceScope()).map((k) => k.time),
      ),
      [0, 1, 5, 8],
    );
    if (await page.evaluate(() => frameEditing))
      await page.locator("#pickZoomFrame").click();
    // Resizing the bar changes hold time, preserving the requested entry and exit.
    const bar = await page.locator(".zoom-motion").boundingBox();
    await page.mouse.move(bar.x + bar.width - 3, bar.y + 7);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * 0.75, bar.y + 7, { steps: 6 });
    await page.mouse.up();
    const timing = await page.evaluate(() => ({
      frames: sequenceFrames(sequenceScope()).map((k) => k.time),
      ...zoomDurations(sequenceScope()),
    }));
    assert.equal(timing.entry, 1);
    assert.equal(timing.exit, 3);
    assert.ok(Math.abs(timing.frames[1] - 1) < 0.01);
    assert.ok(Math.abs(timing.frames[3] - timing.frames[2] - 3) < 0.01);
    await page.locator(".zoom-motion").click({ button: "right" });
    assert.equal(
      await page.locator("#deleteTimelineEffect").textContent(),
      "Elimina zoom",
    );
    assert.equal(
      await page.evaluate(() => project.clips.every((c) => !!c.zoom)),
      true,
    );
    await page.locator("#deleteTimelineEffect").click();
    assert.equal(await page.locator(".zoom-motion").count(), 0);
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    await page.locator("#undoBtn").click();
    assert.equal(await page.locator(".zoom-motion").count(), 1);
    await page.evaluate(() => {
      selection = new Set(project.clips.map((c) => c.id));
      attachElement(project.clips[0], "blur");
    });
    const fx = page.locator(".attachment-bar:not(.zoom-motion)");
    await fx.click({ button: "right" });
    assert.equal(
      await page.locator("#deleteTimelineEffect").textContent(),
      "Elimina effetto",
    );
    assert.equal(
      await page.evaluate(() => project.clips[0].attachments.length),
      1,
    );
    await page.locator("#deleteTimelineEffect").click();
    assert.equal(
      await page.evaluate(() => project.clips[0].attachments.length),
      0,
    );
    assert.equal(
      await page.evaluate(() => project.clips.every((c) => !!c.zoom)),
      true,
    );
    await page.locator("#undoBtn").click();
    assert.equal(
      await page.evaluate(() => project.clips[0].attachments.length),
      1,
    );
    // Audio tile uses the same clip processing and exposes a removable timeline bar.
    await page.evaluate(() => {
      const m = {
        id: "fake-audio",
        name: "audio",
        kind: "audio",
        path: "/not-played.wav",
        duration: 8,
        hasAudio: true,
      };
      project.media.push(m);
      Timeline.addTrack(project);
      project.clips.push({
        id: "audio",
        mediaId: m.id,
        start: 0,
        track: 1,
        in: 0,
        out: 8,
        speed: 1,
        volume: 1,
      });
      warmAudio = () => {};
      selection = new Set(["audio"]);
      previewFocus = "audio";
      changed();
    });
    await page.locator("#addDenoise").click();
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "audio").voice.noise,
      ),
      0.5,
    );
    await page.locator(".noise-effect").click({ button: "right" });
    await page.locator("#deleteTimelineEffect").click();
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "audio").voice.noise,
      ),
      0,
    );
    // Pinning changes window z-order without taking keyboard focus from the editor.
    const pending = app.waitForEvent("window");
    await page.evaluate(() =>
      studio.recordingToolbar({
        active: false,
        countdown: 0,
        finishing: false,
      }),
    );
    const recorder = await pending;
    await recorder.waitForSelector("#start");
    await page.bringToFront();
    await page.evaluate(() =>
      studio.recordingToolbar({
        active: true,
        paused: false,
        countdown: 0,
        finishing: false,
      }),
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle().includes("Registratore"))
          .isAlwaysOnTop(),
      ),
      true,
    );
    await page.evaluate(() =>
      studio.recordingToolbar({ active: true, paused: true }),
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle().includes("Registratore"))
          .isAlwaysOnTop(),
      ),
      true,
    );
    await page.evaluate(() =>
      studio.recordingToolbar({
        active: false,
        countdown: 0,
        finishing: false,
      }),
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle().includes("Registratore"))
          .isAlwaysOnTop(),
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS gallery zoom/noise, two timing controls, fixed fades while trimming, explicit effect menus and undo, simplified properties, 2px yellow border, recorder pins only while busy",
    );
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await app.close().catch(() => {});
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
