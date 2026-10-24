const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-v41-"));
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
      env: { ...process.env, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof sequenceScope === "function");
    await page.evaluate(
      async (file) => {
        await imported(await studio.importPaths([file]));
        addMedia(project.media[0].id, 0, 0);
        const c = project.clips[0];
        c.out = 5;
        for (let t = 0.5; t < 5; t += 0.5)
          Timeline.split(
            project.clips,
            project.clips.map((c) => c.id),
            t,
            uid,
          );
        selection = new Set(project.clips.map((c) => c.id));
        joinSelected();
      },
      path.resolve(__dirname, "../../miologo.png"),
    );
    await page.evaluate(() => {
      document.querySelector("#layoutPanel").open = true;
      $("visualZoom").value = 6;
      $("visualZoom").oninput();
      $("visualZoom").onchange();
      $("zoomEntryDuration").value = 1;
      $("zoomExitDuration").value = 1;
      applyMotion();
    });
    const zoom = await page.evaluate(() => {
      const at = (t) => {
        const c = Timeline.active(project.clips, t)[0];
        return Timeline.zoomAt(c, Timeline.sourceTime(c, t)).scale;
      };
      return [
        at(0.25),
        at(0.75),
        at(1.25),
        at(2.25),
        at(3.75),
        at(4.25),
        at(4.75),
      ];
    });
    assert.ok(zoom[0] < zoom[1]);
    assert.deepEqual(zoom.slice(2, 5), [6, 6, 6]);
    assert.ok(zoom[5] > zoom[6]);
    assert.equal(await page.locator(".sequence-bars .zoom-motion").count(), 1);
    await page.evaluate(() => attachElement(project.clips[0], "text"));
    assert.equal(
      await page
        .locator(".sequence-bars .attachment-bar:not(.zoom-motion)")
        .count(),
      1,
    );
    assert.equal(
      await page.evaluate(
        () =>
          Timeline.expanded(project).clips.filter((c) => c.annotation).length,
      ),
      1,
    );
    const effectBar = await page
      .locator(".sequence-bars .attachment-bar:not(.zoom-motion)")
      .boundingBox();
    await page.mouse.move(effectBar.x + 3, effectBar.y + 7);
    await page.mouse.down();
    await page.mouse.move(
      effectBar.x + effectBar.width * 0.2,
      effectBar.y + 7,
      { steps: 5 },
    );
    await page.mouse.up();
    assert.equal(
      await page
        .locator(".sequence-bars .attachment-bar:not(.zoom-motion)")
        .count(),
      1,
    );
    assert.equal(
      await page.evaluate(
        () =>
          Timeline.expanded(project).clips.filter((c) => c.annotation).length,
      ),
      1,
    );
    assert.ok(
      (await page.evaluate(() =>
        Timeline.duration(
          Timeline.expanded(project).clips.find((c) => c.annotation),
        ),
      )) < 4.1,
    );

    await page.evaluate(() => {
      selection = new Set(project.clips.map((c) => c.id));
      previewFocus = project.clips[0].id;
      properties();
    });
    await page.locator("#pickZoomFrame").click();
    assert.ok(await page.locator(".zoom-frame-box").isVisible());
    const canvas = await page.locator("#previewCanvas").boundingBox();
    await page.mouse.click(
      canvas.x + canvas.width * 0.9,
      canvas.y + canvas.height * 0.25,
    );
    assert.ok(
      await page.evaluate(() => sequenceFrames(sequenceScope())[1].x > 0.8),
    );
    const box = await page.locator(".zoom-frame-box").boundingBox();
    const oldScale = await page.evaluate(
      () => sequenceFrames(sequenceScope())[1].scale,
    );
    await page.mouse.move(box.x + box.width, box.y + box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 25, box.y + box.height + 15, {
      steps: 4,
    });
    await page.mouse.up();
    assert.ok(
      (await page.evaluate(() => sequenceFrames(sequenceScope())[1].scale)) <
        oldScale,
    );
    await page.locator("#pickZoomFrame").click();
    // Move an existing cut segment into another boundary, including its original-source color.
    await page.evaluate(() => {
      editGroup(false);
      project.clips.forEach((c) => {
        delete c.zoom;
        delete c.attachments;
      });
      selection = new Set([project.clips[0].id]);
      changed();
    });
    const insertion = await page.evaluate(() => {
      const c = project.clips[0],
        at = project.clips[5].start;
      project = Timeline.moveInsert(project, [c.id], at, 0);
      changed();
      return { id: c.id, at };
    });
    assert.equal(
      await page.evaluate(
        (id) => project.clips.find((c) => c.id === id).start,
        insertion.id,
      ),
      insertion.at,
    );
    // Real pointer insertion shows a highlighted guide and makes room on release.
    const drag = await page.evaluate(() => {
      const c = project.clips.at(-1),
        target = project.clips
          .filter((x) => x.id !== c.id)
          .sort((a, b) => a.start - b.start)[2];
      selection = new Set([c.id]);
      changed();
      return {
        id: c.id,
        at: target.start,
        x: $("ruler").getBoundingClientRect().left + target.start * scale,
      };
    });
    const dragging = await page
      .locator(`.clip[data-id="${drag.id}"]`)
      .boundingBox();
    await page.mouse.move(
      dragging.x + dragging.width / 2,
      dragging.y + dragging.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(drag.x, dragging.y + dragging.height / 2, {
      steps: 8,
    });
    assert.ok(
      await page.locator(".timeline-snap-guide.insertion-guide").isVisible(),
    );
    await page.mouse.up();
    assert.equal(
      await page.evaluate(
        (id) => project.clips.find((c) => c.id === id).start,
        drag.id,
      ),
      drag.at,
    );
    // The track bottom is unchanged when its TOP edge grows upwards.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--timeline-height", "350px");
      renderTimeline();
    });
    const oldRect = await page.locator("#track0").boundingBox(),
      handle = await page
        .locator('[data-choose-track="0"] .track-resizer')
        .boundingBox();
    await page.mouse.move(handle.x + 5, handle.y + 4);
    await page.mouse.down();
    await page.mouse.move(handle.x + 5, handle.y - 26, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const newRect = await page.locator("#track0").boundingBox();
    assert.ok(newRect.height > oldRect.height);
    assert.ok(
      Math.abs(oldRect.y + oldRect.height - (newRect.y + newRect.height)) < 2,
    );
    const promise = app.waitForEvent("window");
    await page.locator("#recordBtn").click();
    const recorder = await promise;
    await recorder.waitForSelector("#start");
    const layout = await recorder.evaluate(() => {
      const ids = [
        "name",
        "level",
        "state",
        "start",
        "pause",
        "stop",
        "settings",
        "discard",
      ];
      return ids.map((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, x: r.x, y: r.y, h: r.height };
      });
    });
    assert.ok(layout.every((x) => Math.abs(x.y + x.h / 2 - 38) < 3));
    assert.deepEqual(
      layout.map((x) => x.id),
      [
        "name",
        "level",
        "state",
        "start",
        "pause",
        "stop",
        "settings",
        "discard",
      ],
    );
    assert.equal(await recorder.locator("#db,#message").count(), 0);
    assert.equal(await recorder.locator("#maximize").count(), 0);
    assert.equal(await recorder.evaluate(() => window.innerHeight), 76);
    assert.deepEqual(errors, []);
    console.log(
      "PASS one zoom over 10 joined segments, one continuous text bar, visual framing and resize, insert existing clip, fixed-bottom top resize, one-row frameless recorder",
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
