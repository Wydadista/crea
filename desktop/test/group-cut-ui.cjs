const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-workflow-"));
  let app;
  try {
    const input = path.join(dir, "source.mp4"),
      image = path.join(dir, "photo.png"),
      audio = path.join(dir, "audio.wav"),
      ffmpeg = require("ffmpeg-static");
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=160x90:r=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-threads",
      "2",
      "-c:a",
      "aac",
      input,
    ]);
    execFileSync(ffmpeg, ["-v", "error", "-i", input, "-frames:v", "1", image]);
    execFileSync(ffmpeg, ["-v", "error", "-i", input, "-vn", audio]);
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
    await page.waitForFunction(() => typeof render === "function");
    await page.evaluate(
      async ({ input, image, audio, dir }) => {
        await imported(await studio.importPaths([input, image, audio]));
        window.testMedia = clone(project.media);
        await studio.setPreferences({ projects: dir, exports: dir });
        localStorage.setItem("akhbar-edge-snap", "false"); // A previous off preference must not disable movement snapping.
        panelLayout.timeline = 350;
        applyPanels();
        window.makeClip = (
          id,
          start,
          out = 1,
          family = id,
          track = 0,
          mediaId = testMedia[0].id,
        ) => ({
          id,
          start,
          track,
          in: 0,
          out,
          speed: 1,
          volume: 0.6,
          mono: true,
          mediaId,
          sourceInstanceId: family,
        });
        window.resetTest = (clips, count = 2) => {
          pause();
          resetPlayers();
          project = { ...Timeline.empty(), media: clone(testMedia) };
          while (Timeline.trackCount(project) < count)
            Timeline.addTrack(project);
          project.clips = clips;
          project.trackHeights.fill(80);
          history = [];
          future = [];
          selection.clear();
          time = 0;
          scale = 80;
          fitTimeline = false;
          rippleFamily = false;
          showRipple();
          render();
          document.getElementById("timelineScroll").scrollLeft = 0;
        };
      },
      { input, image, audio, dir },
    );
    console.log("UI ready, media imported");
    // Joined cuts expose only the two outside handles, including after undo.
    await page.evaluate(() => {
      resetTest(
        [0, 1, 2].map((i) => ({ ...makeClip("j" + i, i, i + 1, "J"), in: i })),
        3,
      );
      selection = new Set(project.clips.map((c) => c.id));
      joinSelected();
      time = 2.5;
      updateHead();
    });
    assert.equal(await page.locator(".clip .handle").count(), 2);
    assert.equal(await page.locator(".group-cut").count(), 2);
    assert.equal(await page.locator('[data-id="j1"] .handle').count(), 0);
    assert.equal(
      await page
        .locator('[data-id="j0"]')
        .evaluate((n) => getComputedStyle(n).borderTopWidth),
      "3px",
    );
    await page.locator('[data-id="j0"] .handle.left').scrollIntoViewIfNeeded();
    const left = await page
      .locator('[data-id="j0"] .handle.left')
      .boundingBox();
    await page.mouse.move(left.x + 2, left.y + left.height / 2);
    await page.mouse.down();
    await page.mouse.move(left.x + 106, left.y + left.height / 2, { steps: 4 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    assert.equal(await page.locator(".clip .handle").count(), 2);
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => project.clips.length), 3);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    await page.evaluate(() => {
      selection = new Set(project.clips.map((c) => c.id));
    });
    await page.locator('[data-id="j1"]').click({ button: "right" });
    await page.locator('[data-action="unjoin"]').click();
    assert.equal(await page.locator(".clip .handle").count(), 4);
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator(".clip .handle").count(), 2);
    const joinedState = await page.evaluate(() => clone(project.clips));
    await page.locator("#fileMenu > summary").click();
    await page.locator("#fileSave").click();
    await page.locator("#projectNameInput").fill("Joined-cuts");
    await page.locator('#projectNameDialog button[value="save"]').click();
    await page.waitForFunction(() => !saveBusy && !isProjectDirty());
    const savedInfo = await page.evaluate(() => studio.projectInfo());
    await page.evaluate(
      async (file) => applyOpened(await studio.openProject(file)),
      savedInfo.path,
    );
    assert.deepEqual(
      await page.evaluate(() => clone(project.clips)),
      joinedState,
    );
    assert.equal(await page.locator(".clip .handle").count(), 2);
    console.log(
      "Joined outer trim, internal locks, separation and undo/redo passed",
    );
    // A linked group includes all types and two independent clips from the same file.
    await page.evaluate(() => {
      resetTest(
        [
          makeClip("v", 0, 1, "V", 0),
          makeClip("same", 0.4, 1, "W", 1),
          makeClip("p", 0.2, 1, "P", 2, testMedia[1].id),
          makeClip("a", 0.1, 1, "A", 3, testMedia[2].id),
        ],
        4,
      );
      selection = new Set(project.clips.map((c) => c.id));
    });
    await page.locator("#linkTool").click();
    assert.equal(await page.locator(".link-badge").count(), 4);
    assert.equal(
      new Set(
        await page
          .locator(".clip")
          .evaluateAll((nodes) =>
            nodes.map((n) => getComputedStyle(n).backgroundColor),
          ),
      ).size,
      4,
    );
    const beforeMove = await page.evaluate(() =>
      project.clips.map((c) => [c.start, c.track]),
    );
    await page.locator('[data-id="v"]').scrollIntoViewIfNeeded();
    const clip = await page.locator('[data-id="v"]').boundingBox();
    await page.mouse.move(clip.x + 30, clip.y + 40);
    await page.mouse.down();
    await page.mouse.move(clip.x + 190, clip.y + 40, { steps: 4 });
    await page.mouse.up();
    const moved = await page.evaluate(() =>
      project.clips.map((c) => [c.start, c.track]),
    );
    moved.forEach((entry, i) => {
      assert.ok(Math.abs(entry[0] - beforeMove[i][0] - 2) < 1e-8);
      assert.equal(entry[1], beforeMove[i][1]);
    });
    await page.keyboard.press("Control+z");
    assert.deepEqual(
      await page.evaluate(() => project.clips.map((c) => [c.start, c.track])),
      beforeMove,
    );
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(
      await page.evaluate(() => project.clips.map((c) => [c.start, c.track])),
      moved,
    );
    await page.evaluate(() => selectIds(["v"]));
    await page.keyboard.press("Control+Shift+g");
    assert.equal(await page.locator(".link-badge").count(), 0);
    assert.deepEqual(
      await page.evaluate(() => project.clips.map((c) => [c.start, c.track])),
      moved,
    );
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator(".link-badge").count(), 4);
    console.log(
      "Mixed group colours, synced drag, ungroup and undo/redo passed",
    );
    // Real keyboard cut/paste and two separate undo steps.
    await page.evaluate(() => {
      selection = new Set(project.clips.map((c) => c.id));
      window.beforeCut = clone(project);
      time = 8;
      document.getElementById("activeTrack").value = "0";
    });
    await page.keyboard.press("Control+x");
    assert.equal(await page.evaluate(() => project.clips.length), 0);
    await page.keyboard.press("Control+v");
    assert.equal(await page.evaluate(() => project.clips.length), 4);
    const added = await page.evaluate(() => clone(project.clips));
    const originals = await page.evaluate(() => beforeCut.clips);
    added.forEach((c, i) => {
      for (const key of ["in", "out", "speed", "volume", "mono", "track"])
        assert.deepEqual(c[key], originals[i][key]);
      assert.ok(
        Math.abs(c.start - (8 + originals[i].start - originals[0].start)) <
          1e-8,
      );
    });
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => project.clips.length), 0);
    await page.keyboard.press("Control+z");
    assert.deepEqual(
      await page.evaluate(() => clone(project)),
      await page.evaluate(() => beforeCut),
    );
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.evaluate(() => project.clips.length), 0);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.evaluate(() => project.clips.length), 4);
    // Native text editing must not invoke timeline cut.
    await page.evaluate(() =>
      document.getElementById("projectNameDialog").showModal(),
    );
    await page.locator("#projectNameInput").fill("Text editing");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+x");
    assert.equal(await page.locator("#projectNameInput").inputValue(), "");
    assert.equal(await page.evaluate(() => project.clips.length), 4);
    await page.keyboard.press("Control+v");
    assert.equal(
      await page.locator("#projectNameInput").inputValue(),
      "Text editing",
    );
    await page.evaluate(() =>
      document.getElementById("projectNameDialog").close(),
    );
    console.log(
      "Keyboard cut/paste, layout, undo/redo and text-field guard passed",
    );
    for (const index of [0, 1, 2]) {
      await page.evaluate((index) => {
        resetTest([makeClip("only", 0, 2, "F", 7, testMedia[index].id)], 10);
        time = 1;
      }, index);
      await page.locator("#cutTool").click();
      assert.equal(await page.evaluate(() => project.clips.length), 2);
      await page.keyboard.press("Control+z");
      assert.equal(await page.evaluate(() => project.clips.length), 1);
      await page.keyboard.press("Control+Shift+z");
      assert.equal(await page.evaluate(() => project.clips.length), 2);
    }
    await page.evaluate(() => {
      resetTest(
        [
          makeClip("v", 0, 2, "V"),
          makeClip("a", 0, 2, "A", 1, testMedia[2].id),
        ],
        2,
      );
      time = 1;
    });
    await page.locator("#cutTool").click();
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    assert.ok(
      (await page.locator("#toast").innerText()).includes(
        "Più elementi sotto il cursore",
      ),
    );
    await page.evaluate(() => selectIds(["a"]));
    await page.locator("#cutTool").click();
    assert.equal(await page.evaluate(() => project.clips.length), 3);
    await page.evaluate(() => {
      selection.clear();
      time = 0;
    });
    await page.locator("#cutTool").click();
    assert.equal(await page.evaluate(() => project.clips.length), 3);
    assert.deepEqual(errors, []);
    console.log(
      "Unselected video/image/audio split, ambiguity, selected split and zero-duration guard passed",
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
