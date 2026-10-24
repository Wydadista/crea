const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-v4-ui-"));
  let app;
  try {
    app = await _electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        "--no-sandbox",
        "--disable-gpu",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof attachElement === "function");
    await page.evaluate(async (dir) => {
      await studio.setPreferences({
        projects: dir,
        recordings: dir,
        exports: dir,
      });
    }, dir);
    await page.evaluate(
      async (file) => {
        await imported(await studio.importPaths([file]));
        addMedia(project.media[0].id, 0, 0);
      },
      path.resolve(__dirname, "../../miologo.png"),
    );
    await page.evaluate(() => {
      window.parentId = project.clips[0].id;
      const dt = new DataTransfer();
      dt.setData("application/akhbar-element", "text");
      document
        .querySelector(".clip")
        .dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
    });
    assert.equal(await page.locator(".attachment-bar").count(), 1);
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    await page.locator("#annotationPanel").evaluate((d) => (d.open = true));
    await page.locator("#annotationText").fill("Contenuto da conservare");
    await page.locator("#annotationText").dispatchEvent("change");
    await page.locator("#textStyleName").fill("Sottotitoli");
    await page.locator("#saveTextStyle").click();
    await page.evaluate(() => {
      attachElement(project.clips[0], "text");
      first().annotation.text = "Secondo contenuto";
    });
    await page.locator("#textStyles").selectOption("0");
    await page.locator("#applyTextStyle").click();
    assert.equal(
      await page.evaluate(() => first().annotation.text),
      "Secondo contenuto",
    );
    await page.evaluate(() => attachElement(project.clips[0], "blur"));
    await page.locator("#effectsPanel").evaluate((d) => (d.open = true));
    await page.locator("#effectShape").selectOption("circle");
    assert.equal(await page.evaluate(() => first().effect.shape), "circle");
    await page.evaluate(() => {
      const other = decoration("text", project.clips[0]);
      project.media.push(other.m);
      Timeline.addTrack(project);
      project.clips.push({
        ...other.a,
        id: "other",
        start: 0,
        track: 1,
        in: 0,
        out: 2,
        sourceInstanceId: "other",
      });
      selection = new Set(project.clips.map((c) => c.id));
      group();
    });
    assert.equal(await page.locator(".compact-group").count(), 1);
    assert.equal(await page.locator("#track0 .clip").count(), 1);
    assert.equal(await page.locator("#track1 .clip").count(), 0);
    await page.evaluate(() => {
      time = 1;
      split();
    });
    assert.equal(await page.locator(".compact-group").count(), 2);
    const groups = await page.evaluate(() => [
      ...new Set(project.clips.map((c) => c.linkId)),
    ]);
    assert.equal(groups.length, 2);
    await page.evaluate(() => {
      const right = project.clips.filter((c) => c.start >= 1);
      Timeline.move(
        project.clips,
        right.map((c) => c.id),
        4,
        0,
        Timeline.trackCount(project),
      );
      changed();
    });
    assert.equal(
      await page.evaluate(
        () => project.clips.filter((c) => c.start < 1).length,
      ),
      2,
    );
    await page.keyboard.press("n");
    assert.equal(await page.evaluate(() => fitTimeline), true);
    assert.ok(
      await page.evaluate(
        () =>
          Timeline.total(project.clips) * scale <
          $("timelineScroll").clientWidth - 50,
      ),
    );
    await page.keyboard.press("b");
    assert.equal(await page.evaluate(() => fitTimeline), false);
    await page.locator("#railElements").click();
    await page.locator("#elementSmaller").click();
    await page.locator("#elementSmaller").click();
    assert.equal(await page.locator("#elementColumns").innerText(), "4");

    await page.locator("#exportBtn").click();
    assert.equal(await page.locator("#exportCustomQuality").isVisible(), true);
    await page.locator("#exportQuality").fill("63");
    await page.locator("#exportQuality").dispatchEvent("input");
    assert.equal(await page.locator("#exportQualityValue").innerText(), "63%");
    await page.locator("#exportCloseTop").click();
    // Real portable save/reopen retains nested elements and split groups.
    const snapshot = await page.evaluate(() => clone(project.clips));
    await page.locator("#fileMenu > summary").click();
    await page.locator("#fileSave").click();
    await page.locator("#projectNameInput").fill("Versione-04");
    await page.locator("#projectNameInput").press("Enter");
    await page.waitForFunction(() => !saveBusy && !isProjectDirty());
    const info = await page.evaluate(() => studio.projectInfo());
    await page.evaluate(
      async (file) => applyOpened(await studio.openProject(file)),
      info.path,
    );
    assert.deepEqual(await page.evaluate(() => clone(project.clips)), snapshot);
    // Removal is undoable and does not delete the imported source file.
    const mediaId = await page.evaluate(
      () => project.media.find((m) => m.kind === "image").id,
    );
    await page.evaluate((id) => {
      window.removal = removeLibraryMedia(id);
    }, mediaId);
    await page.locator('#appDialog [data-choice="1"]').click();
    await page.evaluate(() => window.removal);
    assert.ok(
      await page.evaluate(
        (id) => project.media.some((m) => m.id === id),
        mediaId,
      ),
    );
    await page.evaluate((id) => {
      window.removal = removeLibraryMedia(id);
    }, mediaId);
    await page.locator('#appDialog [data-choice="0"]').click();
    await page.evaluate(() => window.removal);
    assert.equal(
      await page.evaluate(
        (id) => project.media.some((m) => m.id === id),
        mediaId,
      ),
      false,
    );
    await fs.access(path.resolve(__dirname, "../../miologo.png"));
    await page.keyboard.press("Control+z");
    assert.ok(
      await page.evaluate(
        (id) => project.media.some((m) => m.id === id),
        mediaId,
      ),
    );
    await page.evaluate(() => {
      selection = new Set();
    });
    console.log(
      "PASS nested effects/text styles, compact composition groups, independent split groups, B/N margin, gallery sizes",
    );
    // Recorder is a real separate window, remains after stop/discard, and counts 2 then 1.
    const recorderWindowEvent = app.waitForEvent("window");
    await page.locator("#recordBtn").click();
    await recorderWindowEvent;
    const recorderPage = (await app.windows()).find((p) => p !== page);
    await recorderPage.waitForLoadState();
    await recorderPage.locator("#name").fill("Prova");
    await recorderPage.locator("#name").dispatchEvent("input");
    await page.evaluate(() => {
      $("recordFormat").value = "webm";
      $("recordHeight").value = "720";
      $("recordFps").value = "10";
      $("microphone").checked = false;
    });
    await recorderPage.locator("#start").click();
    await recorderPage.waitForFunction(() => $("state").textContent === "2");
    await recorderPage.waitForFunction(() => $("state").textContent === "1");
    await page.waitForFunction(
      () => recorder?.state === "recording",
      {},
      { timeout: 20000 },
    );
    await new Promise((r) => setTimeout(r, 1200));
    const count = await page.evaluate(() => project.media.length);
    await recorderPage.locator("#stop").click();
    await page.waitForFunction(
      (n) => !finishing && !recorder && project.media.length === n + 1,
      count,
      { timeout: 30000 },
    );
    assert.ok(!recorderPage.isClosed());
    await recorderPage.locator("#start").click();
    await page.waitForFunction(
      () => recorder?.state === "recording",
      {},
      { timeout: 20000 },
    );
    await new Promise((r) => setTimeout(r, 1000));
    const beforeDiscard = await page.evaluate(() => project.media.length);
    await recorderPage.locator("#discard").click();
    await page.waitForFunction(
      () => !recorder && !finishing,
      {},
      { timeout: 20000 },
    );
    assert.equal(
      await page.evaluate(() => project.media.length),
      beforeDiscard,
    );
    assert.ok(!recorderPage.isClosed());
    assert.deepEqual(errors, []);
    console.log(
      "PASS separate persistent recorder, 2/1 countdown, stop imports, discard does not import",
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
