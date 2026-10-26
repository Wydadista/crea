const req = require,
  { _electron } = req("playwright"),
  fs = require("fs/promises"),
  path = require("path"),
  os = require("os"),
  assert = require("assert/strict"),
  run = require("util").promisify(require("child_process").execFile);
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-volume-ui-"));
  let app;
  try {
    const video = path.join(dir, "video.mp4"),
      audio = path.join(dir, "audio.wav"),
      image = path.join(dir, "image.png");
    await run(req("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x90:r=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=900:sample_rate=48000",
      "-t",
      "8",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      video,
    ]);
    await run(req("ffmpeg-static"), ["-v", "error", "-i", video, "-vn", audio]);
    await run(req("ffmpeg-static"), [
      "-v",
      "error",
      "-i",
      video,
      "-frames:v",
      "1",
      image,
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
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof render === "function");
    await page.evaluate(
      async (files) => {
        await imported(await studio.importPaths(files));
        const media = clone(project.media);
        pause();
        resetPlayers();
        project = {
          ...Timeline.empty(),
          media,
          canvasSize: { width: 160, height: 90 },
        };
        Timeline.addTrack(project);
        Timeline.addTrack(project);
        project.trackHeights = [90, 90, 90];
        const m = (kind) => media.find((m) => m.kind === kind).id;
        project.clips = [
          {
            id: "v",
            mediaId: m("video"),
            start: 0,
            track: 0,
            in: 1,
            out: 5,
            speed: 1,
            volume: 1,
          },
          {
            id: "a",
            mediaId: m("audio"),
            start: 0,
            track: 1,
            in: 0,
            out: 2,
            speed: 1,
            volume: 0.5,
          },
          {
            id: "i",
            mediaId: m("image"),
            start: 0,
            track: 2,
            in: 0,
            out: 2,
            speed: 1,
            volume: 0,
          },
        ];
        history = [];
        future = [];
        selection.clear();
        time = 0;
        fitTimeline = false;
        scale = 60;
        render();
      },
      [video, audio, image],
    );
    const state = () => page.evaluate(() => clone(project.clips));
    const initial = await state();
    assert.equal(await page.locator(".clip-volume-line").count(), 0);
    await page.locator('.clip[data-id="v"]').click({ button: "right" });
    await page.click('[data-action="edit-volume"]');
    assert.deepEqual(await state(), initial);
    assert.equal(
      await page.locator(".clip-volume-line").getAttribute("aria-valuenow"),
      "100",
    );
    async function dragBy(fraction) {
      const line = page.locator('.clip[data-id="v"] .clip-volume-line'),
        box = await line.boundingBox(),
        area = await page
          .locator('.clip[data-id="v"] .clip-volume-control')
          .boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2,
        box.y + box.height / 2 + fraction * area.height,
        { steps: 5 },
      );
      await page.mouse.up();
    }
    await dragBy(-0.25);
    assert.equal((await state())[0].volume, 1.5);
    assert.equal(await page.evaluate(() => history.length), 1);
    let after = await state();
    for (let i = 0; i < after.length; i++) {
      const original = { ...initial[i] };
      if (i === 0) original.volume = 1.5;
      assert.deepEqual(after[i], original);
    }
    await page.click("#undoBtn");
    assert.equal((await state())[0].volume, 1);
    await page.click("#redoBtn");
    assert.equal((await state())[0].volume, 1.5);
    await dragBy(2);
    assert.equal((await state())[0].volume, 0);
    assert.equal(
      await page
        .locator('.clip[data-id="v"] .clip-volume-line')
        .getAttribute("aria-valuenow"),
      "0",
    );
    await dragBy(-2);
    assert.equal((await state())[0].volume, 2);
    const line = page.locator('.clip[data-id="v"] .clip-volume-line'),
      box = await line.boundingBox();
    const beforeCancel = await page.evaluate(() => JSON.stringify(project)),
      historyCount = await page.evaluate(() => history.length);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, {
      steps: 3,
    });
    await page.evaluate(() =>
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })),
    );
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => JSON.stringify(project)),
      beforeCancel,
    );
    assert.equal(await page.evaluate(() => history.length), historyCount);
    await line.press("Home");
    assert.equal((await state())[0].volume, 0);
    await line.press("End");
    assert.equal((await state())[0].volume, 2);
    await page.locator('.clip[data-id="a"]').click({ button: "right" });
    await page.click('[data-action="edit-volume"]');
    assert.equal(
      await page
        .locator('.clip[data-id="a"] .clip-volume-line')
        .getAttribute("aria-valuenow"),
      "50",
    );
    await page.locator('.clip[data-id="i"]').click({ button: "right" });
    assert.equal(
      await page.locator('[data-action="edit-volume"]').isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      selection = new Set(["v"]);
      previewFocus = "v";
      properties();
      $("editClipVolume").click();
    });
    assert.equal(
      await page.locator('.clip[data-id="v"] .clip-volume-line').count(),
      0,
    );
    assert.equal((await state())[0].volume, 2);
    await page.evaluate(() => $("editClipVolume").click());
    assert.equal(
      await page
        .locator('.clip[data-id="v"] .clip-volume-line')
        .getAttribute("aria-valuenow"),
      "200",
    );
    assert.deepEqual(errors, []);
    console.log(
      "UI OK: comando dal menu e proprietà, default 100%, volume esistente 50%, trascinamento 0–200%, nessun movimento/taglio, annulla/ripristina, annullamento del gesto, tastiera, media senza audio disabilitati.",
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
