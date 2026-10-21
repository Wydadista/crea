const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-workspace-"));
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
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof insertElement === "function");
    assert.equal(await page.locator("#settingsBtn").count(), 1);
    await page.evaluate(async (dir) => {
      applyPreferences(
        await studio.setPreferences({
          projects: dir,
          recordings: dir,
          exports: dir,
          imageDuration: "2,5",
          freezeDuration: "1,75",
          rulerColor: "#123456",
        }),
      );
    }, dir);
    await page.evaluate(() => {
      project.media = Array.from({ length: 9 }, (_, i) => ({
        id: "m" + i,
        name: "Foto " + i,
        kind: "image",
        path: "/placeholder.png",
        url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        duration: 5,
        width: 160,
        height: 90,
      }));
      renderLibrary();
    });
    await page.locator("#mediaView").selectOption("grid");
    await page.locator("#mediaColumns").selectOption("3");
    const positions = await page
      .locator(".media-card")
      .evaluateAll((els) =>
        els.map((el) => ({
          x: Math.round(el.getBoundingClientRect().x),
          y: Math.round(el.getBoundingClientRect().y),
        })),
      );
    assert.equal(new Set(positions.map((p) => p.x)).size, 3);
    assert.equal(new Set(positions.map((p) => p.y)).size, 3);
    await page.evaluate(() => {
      addMedia("m0", 7, 0);
    });
    assert.equal(await page.evaluate(() => project.clips[0].out), 2.5);
    const before = await page.evaluate(() =>
      project.clips.map((c) => ({ id: c.id, start: c.start, track: c.track })),
    );
    await page.locator("#railElements").click();
    await page.evaluate(() => {
      draggedElement = "text";
      const data = new DataTransfer();
      data.setData("application/akhbar-element", "text");
      document
        .getElementById("track0")
        .dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: data,
            clientX:
              document.getElementById("track0").getBoundingClientRect().left +
              80,
            bubbles: true,
            cancelable: true,
          }),
        );
      draggedElement = null;
    });
    assert.equal(await page.evaluate(() => project.trackCount), 2);
    assert.deepEqual(
      await page.evaluate(() =>
        project.clips
          .filter((c) => c.track === 0)
          .map((c) => ({ id: c.id, start: c.start, track: c.track })),
      ),
      before,
    );
    await page.locator("#alignHorizontal").click();
    assert.ok(
      Math.abs(
        await page.evaluate(() => {
          const b = previewBox(first());
          return b.x + b.width / 2 - 50;
        }),
      ) < 0.001,
    );
    await page.locator("#alignVertical").click();
    assert.ok(
      Math.abs(
        await page.evaluate(() => {
          const b = previewBox(first());
          return b.y + b.height / 2 - 50;
        }),
      ) < 0.001,
    );
    assert.equal(await page.locator("#rangeStart").isVisible(), false);
    assert.equal(await page.locator("#annotationX").isVisible(), false);
    assert.equal(await page.locator("#clipStart").isVisible(), false);
    await app.evaluate(({ dialog }) => {
      globalThis.promptChoice = 2;
      dialog.showMessageBox = async () => ({
        response: globalThis.promptChoice,
      });
    });
    await page.evaluate(() => transitionProject(emptyWorkspace));
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    await app.evaluate(() => {
      globalThis.promptChoice = 1;
    });
    await page.evaluate(() => transitionProject(emptyWorkspace));
    assert.equal(await page.evaluate(() => project.clips.length), 0);
    assert.equal(await page.evaluate(() => isProjectDirty()), false);
    // Real portable save and Save As, using only a tiny image copied from the repository.
    const image = path.resolve(__dirname, "../../miologo.png");
    await page.evaluate(async (file) => {
      await imported(await studio.importPaths([file]));
      addMedia(project.media[0].id, 0, 0);
    }, image);
    await page.locator("#fileMenu summary").first().click();
    await page.locator("#fileSave").click();
    await page.locator("#projectNameInput").fill("Primo");
    await page.locator("#projectNameDialog button[value=save]").click();
    await page.waitForFunction(() => !isProjectDirty());
    await fs.access(path.join(dir, "Primo", "Primo.creastudio"));
    await page.locator("#fileMenu summary").first().click();
    await page.locator("#fileSaveAs").click();
    await page.locator("#projectNameInput").fill("Secondo");
    await page.locator("#projectNameDialog button[value=save]").click();
    await page.waitForFunction(
      () => !saveBusy && !document.getElementById("projectNameDialog").open,
    );
    console.log("SAVE_AS", await page.evaluate(() => studio.projectInfo()));
    await fs.access(path.join(dir, "Secondo", "Secondo.creastudio"));
    const recents = await page.evaluate(() => studio.recentProjects());
    assert.equal(recents.length, 2);
    await page.evaluate(() => transitionProject(emptyWorkspace));
    await page.evaluate(async (file) => {
      applyOpened(await studio.openProject(file));
    }, recents[0]);
    assert.equal(await page.evaluate(() => isProjectDirty()), false);
    await page.locator("#settingsBtn").click();
    await page.locator("#keysBtn").click();
    await page.locator("#keySplit").fill("S; H; Alt+K");
    await page.locator("#keySplit").dispatchEvent("change");
    assert.deepEqual(await page.evaluate(() => keys.split), [
      "s",
      "h",
      "alt+k",
    ]);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 9 items in 3x3, decimal durations, element drag/new track, centering, simplified controls, cancel/discard, portable Save/Save As/recents, multiple shortcut aliases.",
    );
  } catch (e) {
    console.error("FAILURE", e);
    throw e;
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
