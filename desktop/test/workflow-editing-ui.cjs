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
    // Selection and opening are distinct for all three source types.
    for (let i = 0; i < 3; i++) {
      const card = page.locator(".media-card").nth(i);
      await card.click();
      assert.equal(
        await page.locator("#sourceDialog").evaluate((n) => n.open),
        false,
      );
      assert.equal(await card.getAttribute("aria-selected"), "true");
      await card.dblclick();
      assert.equal(
        await page.locator("#sourceDialog").evaluate((n) => n.open),
        true,
      );
      await page.locator("#sourceDialog button").click();
    }
    console.log("Library double click passed");
    // Actual HTML drag from library: imports to timeline without opening preview.
    await page.evaluate(() => resetTest([], 1));
    await page
      .locator(".media-card")
      .first()
      .dragTo(page.locator("#track0"), { targetPosition: { x: 10, y: 30 } });
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    assert.equal(
      await page.locator("#sourceDialog").evaluate((n) => n.open),
      false,
    );
    console.log("Library drag passed");
    // Multi-selection from context menu; paste keeps cuts, speed, temporal and row offsets.
    await page.evaluate(() => {
      resetTest([
        { ...makeClip("a", 0, 2, "A"), in: 0.4, out: 2.4, speed: 2 },
        makeClip("b", 1, 1, "A"),
        makeClip("photo", 0.5, 1, "P", 1, testMedia[1].id),
      ]);
      selection = new Set(project.clips.map((c) => c.id));
      renderTimeline();
      properties();
    });
    await page.locator('[data-id="a"]').click({ button: "right" });
    await page.locator('[data-action="copy"]').click();
    await page.evaluate(() => {
      time = 4;
      document.getElementById("activeTrack").value = "0";
      updateHead();
    });
    await page.keyboard.press("Control+v");
    let pasted = await page.evaluate(() => clone(project.clips.slice(3)));
    assert.deepEqual(
      pasted.map((c) => [c.start, c.track]),
      [
        [4, 0],
        [5, 0],
        [4.5, 1],
      ],
    );
    assert.equal(pasted[0].in, 0.4);
    assert.equal(pasted[0].speed, 2);
    assert.equal(pasted[0].sourceInstanceId, pasted[1].sourceInstanceId);
    assert.notEqual(pasted[0].sourceInstanceId, "A");
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => project.clips.length), 3);
    await page.locator("#redoBtn").click();
    assert.equal(await page.evaluate(() => project.clips.length), 6);
    await page.evaluate(() => {
      time = 4;
    });
    const before = await page.evaluate(() => JSON.stringify(project));
    await page.keyboard.press("Control+v");
    assert.equal(await page.evaluate(() => JSON.stringify(project)), before);
    console.log("Multi paste passed");
    // Paste from the empty track's right-click menu into a chosen track.
    await page.evaluate(() => {
      time = 7;
      selection = new Set(["a"]);
      renderTimeline();
    });
    await page.keyboard.press("Control+c");
    await page
      .locator("#track1")
      .click({ button: "right", position: { x: 600, y: 70 } });
    await page.locator("#pasteTrack").click();
    assert.equal(await page.evaluate(() => project.clips.at(-1).track), 1);
    console.log("Track paste passed");
    // Text/effects/image/audio copies use the same operation; editing a textarea keeps OS clipboard shortcuts.
    await page.evaluate(() => {
      resetTest([], 5);
      annotation("text", { start: 0, track: 1 });
      annotation("arrow", { start: 0, track: 2 });
      addEffect("blur", { start: 0, track: 3 });
      project.clips.push(
        makeClip("video", 0, 1, "V", 0),
        makeClip("audio", 0, 1, "U", 4, testMedia[2].id),
      );
      selection = new Set(project.clips.map((c) => c.id));
      render();
    });
    await page.keyboard.press("Control+c");
    await page.evaluate(() => {
      time = 10;
      document.getElementById("activeTrack").value = "0";
    });
    await page.keyboard.press("Control+v");
    assert.equal(await page.evaluate(() => project.clips.length), 10);
    await page.evaluate(() => {
      const c = project.clips.find((c) => c.annotation?.type === "text");
      selection = new Set([c.id]);
      previewFocus = c.id;
      properties();
    });
    await page.locator("#annotationText").fill("Testo da copiare");
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    await page.keyboard.press("End");
    await page.keyboard.press("Control+v");
    assert.equal(
      await page.locator("#annotationText").inputValue(),
      "Testo da copiareTesto da copiare",
    );
    await page.locator("#annotationText").blur();
    console.log("Text clipboard passed");
    // Split alone does not move anything; deletion and both trims close only insertion A on row 0.
    const setupFamily = async () =>
      page.evaluate(() => {
        resetTest([
          makeClip("a", 0, 1, "A"),
          { ...makeClip("b", 1, 2, "A"), in: 1, out: 3 },
          makeClip("independent", 5, 1, "B"),
          makeClip("upper", 1, 1, "A", 1),
        ]);
        rippleFamily = true;
        showRipple();
      });
    await setupFamily();
    await page.evaluate(() => {
      selection = new Set(["b"]);
      time = 2;
    });
    await page.locator("#cutTool").click();
    assert.deepEqual(
      await page.evaluate(() =>
        project.clips.map((c) => c.start).sort((a, b) => a - b),
      ),
      [0, 1, 1, 2, 5],
    );
    await page.evaluate(() => {
      selection = new Set([
        project.clips.find(
          (c) => c.id !== "upper" && c.start === 1 && c.id !== "a",
        ).id,
      ]);
      renderTimeline();
    });
    await page.locator("#deleteTool").click();
    assert.equal(
      await page.evaluate(
        () =>
          project.clips.find(
            (c) => c.sourceInstanceId === "A" && c.track === 0 && c.id !== "a",
          ).start,
      ),
      1,
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "independent").start,
      ),
      5,
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "upper").start,
      ),
      1,
    );
    const trim = async (side, delta) => {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const box = await page
        .locator(`[data-id="b"] .handle.${side}`)
        .boundingBox();
      await page.mouse.move(box.x + 2, box.y + 12);
      await page.mouse.down();
      await page.mouse.move(box.x + 2 + delta * 80, box.y + 12);
      await page.mouse.up();
    };
    await setupFamily();
    await trim("left", 0.25);
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").start),
      1,
    );
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").in),
      1.25,
    );
    await page.locator("#undoBtn").click();
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").in),
      1,
    );
    await page.locator("#redoBtn").click();
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").in),
      1.25,
    );
    await setupFamily();
    await page.evaluate(() => {
      project.clips.push({
        ...makeClip("following", 3, 1, "A"),
        in: 0,
        out: 1,
      });
      render();
    });
    await trim("right", -0.25);
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "following").start,
      ),
      2.75,
    );
    await setupFamily();
    await page.locator("#rippleFamily").click();
    await trim("left", 0.25);
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.id === "b").start),
      1.25,
    );
    console.log("Family closure passed");
    // Rapid snap across different insertion identities/files, slight overlap and involuntary vertical movement.
    for (const zoom of [16, 80, 320]) {
      await page.evaluate((zoom) => {
        resetTest([
          makeClip("a", 0, 1, "A"),
          makeClip("b", zoom === 320 ? 2 : 3, 1, "B", 0, testMedia[1].id),
        ]);
        scale = zoom;
        render();
      }, zoom);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const b = await page.locator('[data-id="b"]').boundingBox(),
        r = await page.locator("#ruler").boundingBox(),
        grab = Math.min(12, b.width / 2),
        y = b.y + 15;
      await page.mouse.move(b.x + grab, y);
      await page.mouse.down();
      await page.mouse.move(r.x + zoom + grab - 22, y - 20);
      assert.ok(await page.locator(".drop-ghost.snapped").count());
      await page.mouse.up();
      assert.equal(
        await page.evaluate(
          () => project.clips.find((c) => c.id === "b").start,
        ),
        1,
      );
      assert.equal(
        await page.evaluate(
          () => project.clips.find((c) => c.id === "b").track,
        ),
        0,
      );
    }
    console.log("Rapid cross-source snap passed");
    // Three split originals touching one another must form three groups; tiny gap splits one further.
    await page.evaluate(() => {
      const clips = [];
      for (const [j, family] of ["A", "B", "C"].entries())
        for (let i = 0; i < 10; i++)
          clips.push({
            ...makeClip(family + i, j * 2 + i * 0.2, 0.2, family),
            in: i * 0.2,
            out: (i + 1) * 0.2,
          });
      resetTest(clips);
      selection = new Set(project.clips.map((c) => c.id));
      renderTimeline();
    });
    await page.locator("#groupTool").click();
    assert.equal(
      await page.evaluate(
        () => new Set(project.clips.map((c) => c.groupId)).size,
      ),
      3,
    );
    await page.evaluate(() => {
      for (const c of project.clips) if (c.start >= 1) c.start += 0.001;
      selection = new Set(project.clips.map((c) => c.id));
      renderTimeline();
    });
    await page.locator("#groupTool").click();
    assert.equal(
      await page.evaluate(
        () => new Set(project.clips.map((c) => c.groupId)).size,
      ),
      4,
    );
    // Native save and reopen retains the complete editing result.
    const state = await page.evaluate(() => clone(project));
    await page.locator("#fileMenu > summary").click();
    await page.locator("#fileSave").click();
    await page.locator("#projectNameInput").fill("Workflow");
    await page.locator('#projectNameDialog button[value="save"]').click();
    await page.waitForFunction(() => !saveBusy && !isProjectDirty());
    const info = await page.evaluate(() => studio.projectInfo());
    await page.evaluate(
      async (file) => applyOpened(await studio.openProject(file)),
      info.path,
    );
    assert.deepEqual(
      await page.evaluate(() => clone(project.clips)),
      state.clips,
    );
    console.log(
      "UI editing: library, clipboard, family delete/trim, rapid snap, groups, undo/redo, save/reopen passed",
    );
    // Export layout at common window sizes and Chromium zoom factors representing 125/150% UI scaling.
    for (const [w, h] of [
      [1366, 768],
      [1280, 720],
    ])
      for (const zoom of [1, 1.25, 1.5]) {
        await app.evaluate(
          ({ BrowserWindow }, { w, h, zoom }) => {
            const win = BrowserWindow.getAllWindows()[0];
            win.setContentSize(w, h);
            win.webContents.setZoomFactor(zoom);
          },
          { w, h, zoom },
        );
        await page.locator("#exportBtn").click();
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const layout = await page.evaluate(() => {
          const dialog = document
              .getElementById("exportDialog")
              .getBoundingClientRect(),
            footer = document
              .querySelector(".export-footer")
              .getBoundingClientRect(),
            body = document.querySelector(".export-body");
          const bad = [
            ...document.querySelectorAll(
              "#exportDialog input,#exportDialog select,#exportDialog button",
            ),
          ]
            .filter((n) => n.getClientRects().length)
            .filter((n) => {
              const r = n.getBoundingClientRect();
              return r.left < dialog.left - 1 || r.right > dialog.right + 1;
            })
            .map((n) => n.id);
          return {
            dialog: {
              x: dialog.x,
              y: dialog.y,
              right: dialog.right,
              bottom: dialog.bottom,
            },
            footer: { top: footer.top, bottom: footer.bottom },
            bad,
            bodyScroll: body.scrollHeight > body.clientHeight + 1,
            width: innerWidth,
            height: innerHeight,
          };
        });
        assert.deepEqual(layout.bad, []);
        assert.ok(layout.dialog.x >= 0 && layout.dialog.y >= 0);
        assert.ok(
          layout.dialog.right <= layout.width + 1 &&
            layout.dialog.bottom <= layout.height + 1,
        );
        assert.ok(layout.footer.bottom <= layout.height);
        if (w === 1366 && h === 768 && zoom === 1)
          assert.equal(layout.bodyScroll, false);
        await page.locator("#exportPreset").selectOption("custom");
        assert.equal(
          await page.locator("#exportCustomQuality").isVisible(),
          true,
        );
        await page.locator("#exportPreset").selectOption("55");
        assert.equal(
          await page.locator("#exportCustomQuality").isVisible(),
          false,
        );
        await page.locator("#exportAdvanced summary").click();
        await page.locator("#preserveOriginal").check();
        assert.equal(await page.locator("#exportCopyNotice").isVisible(), true);
        assert.equal(
          await page.locator("#exportCpuControl").isVisible(),
          false,
        );
        await page.locator("#preserveOriginal").uncheck();
        await page.locator("#exportClose").click();
      }
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setContentSize(1366, 768);
      win.webContents.setZoomFactor(1);
    });
    // Destination chooser stays native; use a deterministic dialog response in the harness.
    const target = path.join(dir, "final.mp4");
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: target,
      });
    }, target);
    await page.evaluate(() => resetTest([makeClip("short", 0, 1)], 1));
    await page.locator("#exportBtn").click();
    await page.locator("#chooseExportPath").click();
    assert.equal(
      await page.locator("#exportFilename").inputValue(),
      "final.mp4",
    );
    assert.equal(await page.locator("#exportDirectory").inputValue(), dir);
    await page.locator("#exportHeight").selectOption("original");
    await page.locator("#exportFps").fill("12");
    await page.locator("#doExport").click();
    await page.waitForFunction(
      () =>
        !exportBusy &&
        document.getElementById("exportStatus").textContent ===
          "Esportazione completata",
      {},
      { timeout: 15000 },
    );
    assert.equal(await page.locator("#exportResultActions").isVisible(), true);
    assert.equal(await page.locator("#exportPath").textContent(), target);
    await fs.access(target);
    const probe = JSON.parse(
      execFileSync(require("ffprobe-static").path, [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        target,
      ]),
    );
    assert.equal(
      probe.streams.find((s) => s.codec_type === "video").width,
      160,
    );
    assert.equal(
      probe.streams.find((s) => s.codec_type === "video").avg_frame_rate,
      "12/1",
    );
    await page.screenshot({ path: "/tmp/akhbar-export-035.png" });
    assert.deepEqual(errors, []);
    console.log(
      "UI export: responsive layout 100/125/150%, presets, native destination bridge and real 1-second MP4 passed",
    );
  } catch (e) {
    console.error("UI STEP FAILURE", e);
    if (app)
      await (await app.firstWindow())
        .screenshot({ path: "/tmp/akhbar-workflow-failure.png" })
        .catch(() => {});
    throw e;
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
