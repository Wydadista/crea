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
    async function trimCase(joined, magnet, delta, gap = 0) {
      await page.evaluate(
        ({ joined, magnet, gap }) => {
          resetTest([
            makeClip("previous", 0, 1, "Y"),
            makeClip("target", 1 + gap, 1, "X"),
            { ...makeClip("next", 2 + gap, 2, "X"), in: 1 },
            makeClip("other", 1, 1, "Z", 1),
          ]);
          if (joined) {
            selection = new Set(["target", "next"]);
            joinSelected();
          }
          rippleFamily = magnet;
          showRipple();
          time = 0.5;
          updateHead();
        },
        { joined, magnet, gap },
      );
      const before = await page.evaluate(() => clone(project));
      const selector = '[data-id="target"] .handle.left';
      await page.locator(selector).scrollIntoViewIfNeeded();
      const edge = await page.locator(selector).boundingBox();
      const x = edge.x + 2,
        y = edge.y + edge.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + delta * 80, y, { steps: 5 });
      // The gap is visible while dragging; closure happens only on release.
      const preview = await page.evaluate(
        () => project.clips.find((c) => c.id === "target")?.start,
      );
      if (delta < 1) assert.ok(Math.abs(preview - 1 - gap - delta) < 1e-8);
      await page.mouse.up();
      const after = await page.evaluate(() => clone(project));
      const kept = after.clips
        .filter((c) => c.sourceInstanceId === "X")
        .sort((a, b) => a.start - b.start);
      assert.ok(
        Math.abs(kept[0].start - (magnet ? 1 : 1 + gap + delta)) < 1e-8,
      );
      assert.ok(Math.abs(kept[0].in - delta) < 1e-8);
      assert.equal(after.clips.find((c) => c.id === "previous").out, 1);
      assert.equal(after.clips.find((c) => c.id === "other").start, 1);
      await page.keyboard.press("Control+z");
      assert.deepEqual(await page.evaluate(() => clone(project)), before);
      await page.keyboard.press("Control+Shift+z");
      assert.deepEqual(await page.evaluate(() => clone(project)), after);
    }
    await trimCase(false, true, 0.4);
    await trimCase(false, false, 0.4);
    await trimCase(true, true, 0.4);
    await trimCase(true, false, 0.4);
    await trimCase(true, true, 1.4);
    await trimCase(false, true, 0.4, 0.75);
    await trimCase(true, true, 0.4, 0.75);
    await trimCase(false, false, 0.4, 0.75);
    for (const joined of [false, true]) {
      await page.evaluate((joined) => {
        resetTest(
          joined
            ? [0, 1, 2].map((i) => ({
                ...makeClip("fit" + i, i, i + 1, "F"),
                in: i,
              }))
            : [makeClip("fit0", 0, 3, "F")],
        );
        if (joined) {
          selection = new Set(project.clips.map((c) => c.id));
          joinSelected();
        }
        fitTimeline = true;
        renderTimeline();
        time = 1;
        updateHead();
      }, joined);
      const oldScale = await page.evaluate(() => scale);
      const edgeNode = page.locator(".clip .handle.right").last();
      await edgeNode.scrollIntoViewIfNeeded();
      const edge = await edgeNode.boundingBox();
      const x = edge.x + edge.width / 2,
        y = edge.y + edge.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const pixels of [20, 40, 60]) {
        await page.mouse.move(x - pixels, y);
        assert.equal(
          await page.evaluate(() => scale),
          oldScale,
          "zoom must stay fixed during edge dragging",
        );
        assert.ok(
          Math.abs(
            (await page.evaluate(() => Timeline.total(project.clips))) -
              (3 - pixels / oldScale),
          ) < 1e-6,
        );
      }
      await page.mouse.up();
      assert.equal(await page.evaluate(() => fitTimeline), true);
      assert.ok(
        Math.abs(
          (await page.evaluate(() => Timeline.total(project.clips))) -
            (3 - 60 / oldScale),
        ) < 1e-6,
      );
    }
    console.log(
      "PASS stable edge dragging with fit-to-timeline enabled for single and joined clips.",
    );
    console.log(
      "PASS left release: ordinary and joined, magnet on/off, cut source preserved, crossed internal seam, other clips fixed, undo/redo.",
    );
    await page.evaluate(() => {
      resetTest([makeClip("x", 0, 3, "X", 0), makeClip("y", 0, 3, "Y", 1)]);
    });
    const colors = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll(".clip")].map((n) => [
            n.dataset.id,
            getComputedStyle(n).backgroundColor,
          ]),
        ),
      );
    const initial = await colors();
    assert.notEqual(initial.x, initial.y);
    for (const timeAt of [1, 2]) {
      await page.evaluate((at) => {
        selection = new Set(project.clips.map((c) => c.id));
        time = at;
        split();
      }, timeAt);
    }
    async function assertSources() {
      const actual = await colors(),
        clips = await page.evaluate(() => clone(project.clips));
      for (const c of clips)
        assert.equal(
          actual[c.id],
          c.sourceInstanceId === "X" ? initial.x : initial.y,
        );
    }
    assert.equal(await page.locator(".clip").count(), 6);
    await assertSources();
    await page.evaluate(() => {
      selection = new Set(project.clips.map((c) => c.id));
      joinSelected();
    });
    await assertSources();
    await page.locator("#linkTool").click();
    await assertSources();
    await page.keyboard.press("Control+Shift+g");
    await assertSources();
    await page.keyboard.press("Control+z");
    await assertSources();
    const snapshot = await page.evaluate(() => clone(project.clips));
    await page.locator("#fileMenu > summary").click();
    await page.locator("#fileSave").click();
    await page.locator("#projectNameInput").fill("Colori-sorgenti");
    await page.locator('#projectNameDialog button[value="save"]').click();
    await page.waitForFunction(() => !saveBusy && !isProjectDirty());
    const info = await page.evaluate(() => studio.projectInfo());
    await page.evaluate(
      async (file) => applyOpened(await studio.openProject(file)),
      info.path,
    );
    assert.deepEqual(await page.evaluate(() => clone(project.clips)), snapshot);
    await assertSources();
    assert.deepEqual(errors, []);
    console.log(
      "PASS rendered provenance colours: split, join, group/ungroup, undo, real portable save/reopen; no JS errors.",
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
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
