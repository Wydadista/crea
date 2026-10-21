const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-editing-"));
  let app;
  try {
    const input = path.join(dir, "source.mp4");
    execFileSync(require("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=160x90:r=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "60",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "2",
      "-threads",
      "2",
      "-c:a",
      "aac",
      input,
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
    await page.waitForFunction(() => typeof edgeSnapEnabled === "boolean");
    await page.evaluate(
      async ({ input, dir }) => {
        await imported(await studio.importPaths([input]));
        window.testMedia = structuredClone(project.media[0]);
        await studio.setPreferences({ projects: dir });
        panelLayout.timeline = 420;
        applyPanels();
      },
      { input, dir },
    );
    let hasSaved = false;
    const roundTrip = async () => {
      const state = await page.evaluate(() => structuredClone(project));
      await page.locator("#fileMenu summary").first().click();
      await page.locator("#fileSave").click();
      if (!hasSaved) {
        await page.locator("#projectNameInput").fill("Editing");
        await page.locator('#projectNameDialog button[value="save"]').click();
        hasSaved = true;
      }
      await page.waitForFunction(() => !saveBusy && !isProjectDirty());
      const info = await page.evaluate(() => studio.projectInfo());
      await page.evaluate(
        async (file) => applyOpened(await studio.openProject(file)),
        info.path,
      );
      assert.deepEqual(
        await page.evaluate(() => structuredClone(project.clips)),
        state.clips,
      );
    };
    const setup = async (zoom) =>
      page.evaluate((zoom) => {
        pause();
        resetPlayers();
        project = Timeline.empty();
        Timeline.addTrack(project);
        project.media = [structuredClone(window.testMedia)];
        const c = (id, start, from, to, track = 0) => ({
          id,
          mediaId: project.media[0].id,
          start,
          in: from,
          out: to,
          track,
          speed: 1,
          volume: 1,
          mono: true,
          sourceInstanceId: "same",
        });
        project.clips = [
          c("a", 0, 0, 1),
          c("b", zoom === 320 ? 2 : 3, 1, 3),
          c("upper", 12, 0, 1, 1),
        ];
        history = [];
        future = [];
        selection.clear();
        fitTimeline = false;
        scale = zoom;
        time = 0;
        render();
        document.getElementById("timelineScroll").scrollLeft = 0;
        document.getElementById("timelineScroll").scrollTop = 0;
      }, zoom);
    for (const zoom of [16, 40, 137, 320]) {
      await setup(zoom);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const handle = await page
        .locator('[data-id="b"] .handle.left')
        .boundingBox();
      if (!handle) {
        console.log(
          "HANDLE_DEBUG",
          zoom,
          await page.evaluate(() => ({
            clips: project.clips,
            selection: [...selection],
            tracks: document.querySelectorAll(".track").length,
            scroll: document.getElementById("timelineScroll").scrollTop,
            html: document.querySelector('[data-id="b"]')?.outerHTML,
          })),
        );
        await page.screenshot({ path: "/tmp/akhbar-handle-failure.png" });
      }
      await page.mouse.move(handle.x + 2, handle.y + 20);
      await page.mouse.down();
      const trimAmount = zoom === 320 ? 1.75 : 0.25;
      await page.mouse.move(handle.x + 2 + trimAmount * zoom, handle.y + 20);
      await page.mouse.up();
      const trimmed = await page.evaluate(() =>
        structuredClone(project.clips.find((c) => c.id === "b")),
      );
      assert.ok(Math.abs(trimmed.in - (1 + trimAmount)) < 1e-6);
      assert.ok(
        Math.abs(trimmed.start - ((zoom === 320 ? 2 : 3) + trimAmount)) < 1e-6,
      );
      const box = await page.locator('[data-id="b"]').boundingBox(),
        ruler = await page.locator("#ruler").boundingBox();
      const grab = Math.min(20, box.width / 2),
        x = box.x + grab,
        y = box.y + 12;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(ruler.x + zoom + grab - 22, y - 28);
      if (!(await page.locator(".drop-ghost.snapped").count())) {
        console.log(
          "SNAP_DEBUG",
          zoom,
          { box, ruler, handle, trimmed },
          await page.evaluate(() => ({
            clips: project.clips,
            selection: [...selection],
            scroll: document.getElementById("timelineScroll").scrollLeft,
            ghosts: [...document.querySelectorAll(".drop-ghost")].map((n) => ({
              text: n.textContent,
              style: n.style.cssText,
            })),
          })),
        );
        await page.screenshot({ path: "/tmp/akhbar-snap-failure.png" });
      }
      assert.ok(await page.locator(".drop-ghost.snapped").count());
      assert.equal(await page.locator(".drop-ghost.invalid").count(), 0);
      await page.mouse.up();
      const moved = await page.evaluate(() =>
        structuredClone(project.clips.find((c) => c.id === "b")),
      );
      assert.equal(moved.start, 1);
      assert.equal(moved.track, 0);
      assert.equal(moved.in, trimmed.in);
      assert.equal(moved.out, trimmed.out);
      console.log("SNAP_PASS", zoom);
      await page.locator("#undoBtn").click();
      assert.equal(
        await page.evaluate(
          () => project.clips.find((c) => c.id === "b").start,
        ),
        trimmed.start,
      );
      await page.locator("#redoBtn").click();
      assert.equal(
        await page.evaluate(
          () => project.clips.find((c) => c.id === "b").start,
        ),
        1,
      );
      assert.equal(
        await page.evaluate(
          () => project.clips.find((c) => c.id === "upper").start,
        ),
        12,
      );
    }
    await roundTrip();
    // A pointerup at a newer coordinate must be evaluated, rather than reusing the last ghost.
    await setup(40);
    let box = await page.locator('[data-id="b"]').boundingBox(),
      ruler = await page.locator("#ruler").boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 40 + 20 + 40, box.y + 20);
    await page.evaluate(
      ({ x, y }) =>
        window.dispatchEvent(
          new PointerEvent("pointerup", {
            clientX: x,
            clientY: y,
            pointerId: 1,
            button: 0,
            bubbles: true,
          }),
        ),
      { x: ruler.x + 40 + 20 - 20, y: box.y + 32 },
    );
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").start),
      1,
    );
    // The magnet switch really disables snapping, independently of ripple deletion.
    await setup(40);
    await page.locator("#edgeSnap").click();
    box = await page.locator('[data-id="b"]').boundingBox();
    ruler = await page.locator("#ruler").boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 40 + 20 - 6, box.y + 25);
    assert.equal(await page.locator(".drop-ghost.snapped").count(), 0);
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").start),
      3,
    );
    await page.locator("#edgeSnap").click();
    await setup(40);
    box = await page.locator('[data-id="b"]').boundingBox();
    const target = await page.locator("#track1").boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, target.y + 50);
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").track),
      1,
    );
    // Select just segments 8 and 9, use Enter in both property and context controls.
    await page.evaluate(() => {
      resetPlayers();
      project = Timeline.empty();
      project.media = [structuredClone(window.testMedia)];
      project.clips = Array.from({ length: 15 }, (_, i) => ({
        id: "s" + i,
        mediaId: project.media[0].id,
        start: i + (i >= 9 ? 8 : 0),
        in: i * 4,
        out: (i + 1) * 4,
        track: 0,
        speed: 4,
        speedReference: 1,
        workSpeedActive: true,
        volume: 1,
        sourceInstanceId: "same",
      }));
      history = [];
      future = [];
      selection.clear();
      scale = 40;
      time = 0;
      render();
      window.beforeSpeed = structuredClone(project.clips);
    });
    await page.locator('[data-id="s7"]').click({ position: { x: 20, y: 20 } });
    await page
      .locator('[data-id="s8"]')
      .click({ position: { x: 20, y: 20 }, modifiers: ["Control"] });
    assert.deepEqual(await page.evaluate(() => [...selection].sort()), [
      "s7",
      "s8",
    ]);
    await page.locator("#clipSpeed").fill("1");
    await page.locator("#clipSpeed").press("Enter");
    assert.equal(await page.evaluate(() => project.clips[7].speed), 1);
    assert.equal(await page.evaluate(() => project.clips[8].speed), 1);
    assert.equal(await page.evaluate(() => project.clips[8].start), 11);
    assert.ok(
      await page.evaluate(() =>
        project.clips.every(
          (c, i) =>
            i === 7 ||
            i === 8 ||
            JSON.stringify(c) === JSON.stringify(beforeSpeed[i]),
        ),
      ),
    );
    assert.equal(await page.evaluate(() => playing), false);
    await page.locator("#clipSpeed").fill("4");
    await page.locator("#applyProperties").click();
    await page.locator("#resetSpeed").click();
    assert.equal(await page.evaluate(() => project.clips[7].speed), 1);
    assert.equal(await page.evaluate(() => project.clips[9].speed), 4);
    const snapshot = await page.evaluate(() => JSON.stringify(project));
    await page.locator("#clipSpeed").fill("0,5");
    await page.locator("#clipSpeed").press("Enter");
    assert.equal(await page.evaluate(() => JSON.stringify(project)), snapshot);
    await page
      .locator('[data-id="s7"]')
      .click({ button: "right", position: { x: 30, y: 20 } });
    await page.locator('[data-action="set-speed"]').click();
    await page.locator("#speedDialogValue").fill("4");
    await page.locator("#speedDialogValue").press("Enter");
    assert.equal(
      await page.locator("#speedDialog").evaluate((n) => n.open),
      false,
    );
    assert.equal(await page.evaluate(() => project.clips[8].speed), 4);
    await page
      .locator('[data-id="s7"]')
      .click({ button: "right", position: { x: 30, y: 20 } });
    await page.locator('[data-action="speed"]').click();
    assert.equal(await page.evaluate(() => project.clips[8].speed), 1);
    assert.equal(await page.evaluate(() => project.clips[6].speed), 4);
    await page.locator("#settingsBtn").click();
    await page.locator("#imageDuration").fill("2,75");
    await page.locator("#imageDuration").press("Enter");
    await page.waitForFunction(() => workspacePrefs.imageDuration === 2.75);
    await page.locator("#settingsDialog .close").click();
    await roundTrip();
    // Real gaps of a tenth of a second split visual groups at every zoom.
    await page.evaluate(() => {
      project.clips = [0, 1, 2, 3.1, 4.1, 7].map((start, i) => ({
        id: "g" + i,
        mediaId: project.media[0].id,
        start,
        in: i,
        out: i + 1,
        track: 0,
        speed: 1,
        volume: 1,
      }));
      selection = new Set(project.clips.map((c) => c.id));
      history = [];
      future = [];
      scale = 137;
      render();
    });
    await page.locator("#groupTool").click();
    assert.ok(
      await page.evaluate(
        () =>
          project.clips[0].groupId === project.clips[2].groupId &&
          project.clips[3].groupId === project.clips[4].groupId &&
          project.clips[0].groupId !== project.clips[3].groupId &&
          !project.clips[5].groupId,
      ),
    );
    assert.equal(await page.locator(".group-cut").count(), 3);
    const colors = await page
      .locator('[data-id="g0"],[data-id="g1"],[data-id="g2"]')
      .evaluateAll((ns) => ns.map((n) => getComputedStyle(n).backgroundColor));
    assert.equal(new Set(colors).size, 1);
    await page.locator("#undoBtn").click();
    assert.ok(
      await page.evaluate(() => project.clips.every((c) => !c.groupId)),
    );
    await page.locator("#redoBtn").click();
    assert.equal(await page.locator(".group-cut").count(), 3);
    // Thin ruler, no overlaps at intermediate zooms, scroll positions and widths.
    assert.equal(
      await page
        .locator("#ruler")
        .evaluate((n) => n.getBoundingClientRect().height),
      24,
    );
    for (const zoom of [8, 23, 40, 75, 137, 220, 320, 477, 640])
      for (const scroll of [0, 800]) {
        await page.evaluate(
          ({ zoom, scroll }) => {
            scale = zoom;
            fitTimeline = false;
            renderTimeline();
            document.getElementById("timelineScroll").scrollLeft = scroll;
            renderRuler();
          },
          { zoom, scroll },
        );
        const labels = await page.evaluate(() =>
          [...document.querySelectorAll("#ruler .tick")].map((n) => {
            const r = n.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }),
        );
        assert.ok(labels.length <= 8);
        for (let i = 1; i < labels.length; i++)
          assert.ok(
            labels[i].left >= labels[i - 1].right + 10,
            JSON.stringify({ zoom, scroll, labels }),
          );
      }
    await page.evaluate(() => {
      scale = 40;
      renderTimeline();
      document.getElementById("timelineScroll").scrollLeft = 0;
    });
    await page.evaluate(() => {
      Timeline.addTrack(project);
      project.clips.push({
        id: "cross",
        mediaId: project.media[0].id,
        start: 0,
        in: 0,
        out: 1,
        track: 1,
        speed: 1,
        volume: 1,
      });
      render();
    });
    await page.locator('[data-id="g0"]').click({ position: { x: 20, y: 20 } });
    await page
      .locator('[data-id="cross"]')
      .click({ position: { x: 20, y: 20 }, modifiers: ["Control"] });
    await page.locator("#groupAcrossTracks").click();
    assert.ok(
      await page.evaluate(
        () =>
          project.clips.find((c) => c.id === "g0").groupId ===
          project.clips.find((c) => c.id === "cross").groupId,
      ),
    );
    await roundTrip();
    await page.evaluate(() => {
      checkpoint();
      const track = Timeline.addTrack(project);
      annotation("text", { start: 0, track });
    });
    await page.locator("#annotationText").fill("Riga uno");
    await page.locator("#annotationText").press("End");
    await page.locator("#annotationText").press("Enter");
    await page.locator("#annotationText").pressSequentially("Riga due");
    assert.equal(
      await page.locator("#annotationText").inputValue(),
      "Riga uno\nRiga due",
    );
    await page.locator("#applyProperties").click();
    assert.equal(
      await page.evaluate(() => first().annotation.text),
      "Riga uno\nRiga due",
    );
    assert.equal(await page.evaluate(() => playing), false);
    const finalInfo = await page.evaluate(() => studio.projectInfo());
    await page.evaluate(
      async (file) => applyOpened(await studio.openProject(file)),
      finalInfo.path,
    );
    await page.screenshot({ path: "/tmp/akhbar-editing-ui.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: trim then fast snap at 4 zooms, overshoot, vertical jitter, release-only final coordinate, magnet off, intentional track change, undo/redo; selected-only speed and atomic conflicts via Enter/Apply/reset/context; settings Enter; contiguous group colors/cuts; 24px ruler and non-overlapping intermediate zoom labels; actual portable save/reopen.",
    );
  } catch (error) {
    if (app) {
      const page = await app.firstWindow();
      console.log(
        "FAIL_STATE",
        await page.evaluate(() => ({
          viewport: [innerWidth, innerHeight],
          height: panelLayout.timeline,
          undo: document
            .getElementById("undoBtn")
            .getBoundingClientRect()
            .toJSON(),
          scroll: [scrollX, scrollY],
          errors: document.getElementById("toast").textContent,
          media: project.media.length,
          clips: project.clips.length,
        })),
      );
      await page.screenshot({ path: "/tmp/akhbar-editing-failure.png" });
    }
    throw error;
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
