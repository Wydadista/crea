const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-design-"));
  let app;
  try {
    app = await electron.launch({
      args: [path.resolve(__dirname, ".."), "--no-sandbox", "--disable-gpu"],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => typeof transitionProject === "function");
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = () => {
        throw Error("Unexpected native confirmation");
      };
    });
    await page.evaluate(async (dir) => {
      await studio.setPreferences({ projects: dir, exports: dir });
    }, dir);
    assert.equal(await page.locator("#rippleFamily svg").count(), 1);
    assert.equal((await page.locator("#rippleFamily").innerText()).trim(), "");
    const original = await page
      .locator("#rippleFamily")
      .getAttribute("aria-pressed");
    await page.locator("#rippleFamily").click();
    assert.notEqual(
      await page.locator("#rippleFamily").getAttribute("aria-pressed"),
      original,
    );
    assert.ok(
      (await page.locator("#rippleFamily").getAttribute("aria-label")).includes(
        "Chiudi spazi",
      ),
    );
    await page.reload();
    await page.waitForFunction(() => typeof render === "function");
    assert.notEqual(
      await page.locator("#rippleFamily").getAttribute("aria-pressed"),
      original,
    );
    assert.equal(await page.locator("#freezeFrame svg").count(), 1);
    const video = path.join(dir, "source.mp4");
    require("node:child_process").execFileSync(require("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=160x90:r=12",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      video,
    ]);
    await page.evaluate(async (video) => {
      await imported(await studio.importPaths([video]));
      addMedia(project.media[0].id, 0, 0);
      selectIds([project.clips[0].id]);
      seek(0.5);
    }, video);
    const originalClip = await page.evaluate(() =>
      JSON.stringify(project.clips[0]),
    );
    await page.locator("#freezeFrame").click();
    await page.waitForFunction(() => project.clips.length === 2);
    assert.equal(await page.evaluate(() => mediaOf(first()).kind), "image");
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips[0])),
      originalClip,
    );
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    await page.evaluate(() => {
      pause();
      resetPlayers();
      project = Timeline.empty();
      selection.clear();
      history = [];
      future = [];
      time = 0;
      cleanProjectJSON = JSON.stringify(project);
      render();
    });

    assert.equal(await page.locator(".ruler-label #trackHeight").count(), 1);
    const height = await page.evaluate(() => project.defaultTrackHeight);
    await page.locator("#trackHeightPlus").click();
    assert.ok(
      await page.evaluate((h) => project.defaultTrackHeight > h, height),
    );
    await page.locator("#trackHeightMinus").click();
    assert.equal(await page.evaluate(() => project.defaultTrackHeight), height);
    await page.locator("#railElements").click();
    assert.equal(await page.locator(".element-tile").count(), 5);
    for (const tile of await page.locator(".element-tile").all()) {
      const box = await tile.boundingBox();
      assert.ok(box.width >= 95 && box.height >= 110);
      assert.equal(await tile.getAttribute("draggable"), "true");
    }
    assert.ok(
      await page
        .locator("#addBlur img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    );
    assert.ok(
      await page
        .locator("#addPixel img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    );
    await page.locator("#addText").click();
    assert.equal(await page.evaluate(() => first().annotation.type), "text");
    await page.evaluate(() => {
      time = 6;
    });
    await page.locator("#addArrow").click();
    assert.equal(await page.evaluate(() => first().annotation.type), "arrow");
    await page.evaluate(() => {
      time = 12;
    });
    await page.locator("#addCircle").click();
    assert.equal(await page.evaluate(() => first().annotation.type), "circle");
    await page.evaluate(() => {
      time = 18;
    });
    await page.locator("#addBlur").click();
    assert.equal(await page.evaluate(() => first().effect.type), "blur");
    await page.evaluate(() => {
      time = 24;
    });
    await page.locator("#addPixel").click();
    assert.equal(await page.evaluate(() => first().effect.type), "pixel");
    await page.screenshot({ path: "/tmp/akhbar-elements-refreshed.png" });
    // Cancel, keyboard Escape, repeated close, then save cancellation: no data lost.
    const clips = await page.evaluate(() => JSON.stringify(project.clips));
    await page.evaluate(() => {
      void transitionProject(emptyWorkspace);
    });
    await page.locator("#appDialog").waitFor();
    assert.ok(
      (await page.locator("#appDialog").innerText()).includes("AKhbar"),
    );
    await page.screenshot({ path: "/tmp/akhbar-confirm-refreshed.png" });
    await page.keyboard.press("Control+s");
    assert.equal(
      await page.locator("#projectNameDialog").evaluate((d) => d.open),
      false,
    );
    await page.locator('#appDialog [data-choice="2"]').click();
    await page.waitForFunction(() => !transitionBusy);
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips)),
      clips,
    );
    await page.evaluate(() => {
      void transitionProject(emptyWorkspace);
    });
    await page.locator("#appDialog").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !transitionBusy);
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips)),
      clips,
    );
    await page.evaluate(() => {
      void transitionProject(emptyWorkspace);
    });
    await page.locator('#appDialog [data-choice="0"]').click();
    await page.locator('#projectNameDialog button[value="cancel"]').click();
    await page.waitForFunction(() => !transitionBusy);
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips)),
      clips,
    );
    // Save before closing: a real project file is written before clearing the workspace.
    await page.evaluate(() => {
      void transitionProject(emptyWorkspace);
    });
    await page.locator('#appDialog [data-choice="0"]').click();
    await page.locator("#projectNameInput").fill("Grafica");
    await page.locator('#projectNameDialog button[value="save"]').click();
    await page.waitForFunction(
      () => !transitionBusy && project.clips.length === 0,
    );
    const file = path.join(dir, "Grafica", "Grafica.creastudio");
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(saved.clips.length, 5);
    await page.evaluate(async (file) => {
      applyOpened(await studio.openProject(file));
    }, file);
    // Existing-name replacement also uses the themed prompt; cancel must not overwrite.
    const originalFile = await fs.readFile(file, "utf8");
    await page.evaluate(() => {
      void saveCurrent(true);
    });
    await page.locator("#projectNameInput").fill("Grafica");
    await page.locator('#projectNameDialog button[value="save"]').click();
    await page.locator("#appDialog").waitFor();
    assert.ok(
      (await page.locator("#appDialogTitle").innerText()).includes(
        "Esiste già",
      ),
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !saveBusy);
    assert.equal(await fs.readFile(file, "utf8"), originalFile);
    // Different main-process callers use the same modal, with their own safe cancel index.
    await fs.writeFile(path.join(dir, "Existing.mp4"), "keep-existing-video");
    await page.evaluate((dir) => {
      window.exportRequest = studio.exportVideo(project, {
        outputDirectory: dir,
        outputName: "Existing.mp4",
      });
    }, dir);
    await page.locator("#appDialog").waitFor();
    assert.equal(
      await page.locator("#appDialogTitle").innerText(),
      "File già esistente",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.exportRequest), null);
    assert.equal(
      await fs.readFile(path.join(dir, "Existing.mp4"), "utf8"),
      "keep-existing-video",
    );
    await page.evaluate(async () => {
      project.clips[0].volume = 0.2;
      await studio.autosave(project);
      window.recoverRequest = studio.recover();
    });
    await page.locator('#appDialog [data-choice="1"]').click();
    assert.equal(await page.evaluate(() => window.recoverRequest), null);
    await page.evaluate(async () => {
      await studio.autosave(project);
      window.recoverRequest = studio.recover();
    });
    await page.locator('#appDialog [data-choice="0"]').click();
    assert.equal(
      (await page.evaluate(() => window.recoverRequest)).clips.length,
      5,
    );
    // Exercise the OS window-close event, cancel once and then discard edits.
    await page.evaluate(() => {
      project.clips[0].volume = 0.35;
    });
    const window = await app.browserWindow(page);
    await window.evaluate((win) => win.close());
    await page.locator('#appDialog [data-choice="2"]').click();
    await page.waitForFunction(() => !transitionBusy);
    assert.equal(await page.evaluate(() => project.clips.length), 5);
    await page.evaluate(() => {
      void transitionProject(emptyWorkspace);
    });
    await page.locator('#appDialog [data-choice="1"]').click();
    await page.waitForFunction(
      () => !transitionBusy && project.clips.length === 0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: visual tiles and actions, compact persistent magnet, height controls, themed cancel/Escape/save/discard, save cancellation, actual save/reopen, replacement protection and window-close cancellation; no native confirmations.",
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
