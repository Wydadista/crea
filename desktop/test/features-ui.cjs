const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const bundled = (f) =>
  path.join(
    path.dirname(f),
    path.basename(f, path.extname(f)),
    path.basename(f),
  );
const resolvedProject = (p, file) => {
  const out = structuredClone(p);
  for (const m of out.media)
    if (m.path) {
      m.path = path.resolve(path.dirname(file), m.path);
      m.url = require("node:url").pathToFileURL(m.path).href;
    }
  return out;
};
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "crea-new-ui-"));
  let app;
  try {
    const video = path.join(temp, "source.mp4"),
      save = path.join(temp, "montaggio.creastudio");
    await run(require("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=12",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.25*sin(2*PI*440*t)|0:s=48000",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      video,
    ]);
    app = await electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(temp, "config"),
        XDG_CACHE_HOME: path.join(temp, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, { video, save }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [video],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: save,
        });
        dialog.showMessageBox = async () => ({ response: 0 });
      },
      { video, save },
    );
    // Install a virtual clock before reload to verify the real one-minute autosave timer.
    await page.clock.install();
    await page.reload();
    await page.locator("#addTrack").click();
    await page.locator("#addTrack").click();
    await page.locator("#activeTrack").selectOption("0");
    await page.locator("#importBtn").click();
    await page.waitForFunction(() => project.media.length === 1);
    await page.locator(".media-card button").click();
    await page.waitForFunction(() =>
      [...players.values()].some((p) => p.element.readyState >= 2),
    );
    await page.evaluate(() => {
      selection.clear();
      seek(0.5);
    });
    await page.waitForFunction(
      () =>
        Math.abs([...players.values()][0].element.currentTime - 0.5) < 0.03 &&
        ![...players.values()][0].element.seeking,
    );
    const before = await page
      .locator("#previewCanvas")
      .evaluate((c) => c.toDataURL());
    await page.evaluate(() => seek(2));
    await page.waitForFunction(() => ![...players.values()][0].element.seeking);
    assert.notEqual(
      before,
      await page.locator("#previewCanvas").evaluate((c) => c.toDataURL()),
    );
    assert.equal(await page.evaluate(() => playing), false);
    // Green playhead can itself be dragged while paused.
    let ruler = await page.locator("#ruler").boundingBox(),
      head = await page.locator("#playhead span").boundingBox();
    await page.mouse.move(head.x + head.width / 2, head.y + 5);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 40, ruler.y + 12);
    await page.mouse.up();
    assert.ok(Math.abs((await page.evaluate(() => time)) - 1) < 0.08);
    // Set up two separate pieces, then use actual pointer dragging to snap their edges.
    await page.evaluate(() => {
      const c = project.clips[0];
      c.out = 1;
      c.start = 0;
      project.clips.push({ ...clone(c), id: uid(), start: 1.2 });
      selection.clear();
      time = 0;
      setZoom(100);
      changed();
    });
    const second = await page.locator("#track0 .clip").nth(1).boundingBox();
    await page.mouse.move(second.x + 25, second.y + 20);
    await page.mouse.down();
    await page.mouse.move(second.x + 8, second.y + 20, { steps: 5 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => project.clips[1].start), 1);
    assert.equal(await page.evaluate(() => project.clips[1].track), 0);
    await page.evaluate(() => {
      selection = new Set([project.clips[0].id]);
      time = 0.5;
      changed();
    });
    await page.locator("#monoClip").check();
    await page.locator("#voiceNoise").fill("30");
    await page.locator("#voiceNoise").dispatchEvent("change");
    await page.locator("#voiceLevel").fill("40");
    await page.locator("#voiceLevel").dispatchEvent("change");
    await page.waitForFunction(() => transport.buffers.size > 0);
    assert.ok(
      await page.evaluate(
        () => project.clips[0].mono && project.clips[0].voice.noise === 0.3,
      ),
    );
    await page.locator("#muteClip").check();
    assert.equal(
      await page.evaluate(() => (project.clips[0].muted ? 0 : 1)),
      0,
    );
    await page.locator("#muteClip").uncheck();
    await page.locator("#timelineScroll").evaluate((e) => {
      e.scrollTop = 0;
      e.dispatchEvent(new Event("scroll"));
    });
    await page.locator('[data-choose-track="2"] .track-mute').click();
    assert.equal(await page.evaluate(() => project.trackMuted[2]), true);
    // Resize only one track; horizontal scale stays fixed.
    const h = await page
      .locator('[data-choose-track="2"] .track-resizer')
      .boundingBox();
    await page.mouse.move(h.x + 10, h.y + 3);
    await page.mouse.down();
    await page.mouse.move(h.x + 10, h.y + 73);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => project.trackHeights[2]), 170);
    assert.equal(await page.evaluate(() => scale), 100);
    const ph = await page.locator(".library > .panel-resizer").boundingBox();
    await page.mouse.move(ph.x + 3, ph.y + 30);
    await page.mouse.down();
    await page.mouse.move(ph.x + 63, ph.y + 30);
    await page.mouse.up();
    const libraryWidth = await page
      .locator(".library")
      .evaluate((e) => Math.round(e.getBoundingClientRect().width));
    assert.equal(libraryWidth, 325);
    await page.locator("#activeTrack").selectOption("1");
    await page.locator("#railElements").click();
    await page.locator("#addPixel").click();
    await page.locator("#railMedia").click();
    assert.equal(await page.evaluate(() => mediaOf(first()).kind), "effect");
    await page.evaluate(() => {
      first().start = 0.5;
      first().out = 0.75;
      first().track = 1;
      seek(0.6);
      changed();
    });
    // Resize effect area through the preview handle, using the fitted video rectangle.
    let handle = await page.evaluate(() => {
      const r = previewRect(),
        b = previewBox(first());
      return {
        x: r.left + ((b.x + b.width) / 100) * r.width,
        y: r.top + ((b.y + b.height) / 100) * r.height,
      };
    });
    const oldWidth = await page.evaluate(() => first().effect.width);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 15, handle.y + 10);
    await page.mouse.up();
    assert.ok((await page.evaluate(() => first().effect.width)) > oldWidth);
    await page.locator("#activeTrack").selectOption("2");
    await page.locator("#railElements").click();
    await page.locator("#addText").click();
    await page.locator("#railMedia").click();
    await page
      .locator("#annotationText")
      .fill(
        "Testo molto lungo da distribuire su più righe automaticamente\nRiga manuale",
      );
    await page.locator("#annotationText").press("Tab");
    await page.locator("#textWidth").fill("25");
    await page.locator("#textWidth").press("Tab");
    assert.equal(await page.evaluate(() => first().annotation.width), 25);
    const wrapped = await page.evaluate(() => {
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = "64px Arial";
      return Scene.wrap(ctx, first().annotation.text, 480);
    });
    assert.ok(wrapped.length > 2);
    assert.equal(wrapped.at(-1), "Riga manuale");
    // Group members on three tracks remain separate and preserve timing and tracks.
    await page.evaluate(() => {
      project.clips.at(-1).track = 2;
      selection = new Set(project.clips.map((c) => c.id));
      group();
    });
    assert.equal(await page.locator(".clip").count(), 4);
    const origins = await page.evaluate(() =>
      project.clips.map((c) => [c.start, c.track]),
    );
    await page.evaluate(() => {
      Timeline.move(
        project.clips,
        project.clips.map((c) => c.id),
        0.4,
      );
      changed();
    });
    const moved = await page.evaluate(() =>
      project.clips.map((c) => [c.start - 0.4, c.track]),
    );
    moved.forEach((c, i) => {
      assert.ok(Math.abs(c[0] - origins[i][0]) < 1e-9);
      assert.equal(c[1], origins[i][1]);
    });
    // Upper horizontal zoom doubles while keeping all geometry in px/second.
    await page.locator("#zoom").fill("640");
    await page.locator("#zoom").dispatchEvent("input");
    assert.equal(await page.evaluate(() => scale), 640);
    await page.locator("#previewQuality").selectOption("640");
    assert.equal(
      await page.locator("#previewCanvas").getAttribute("width"),
      "640",
    );
    await page.locator("#exportBtn").click();
    await page.locator("#exportPreset").selectOption("35");
    assert.equal(await page.locator("#exportHeight").inputValue(), "1080");
    await page.locator("#exportDialog .close").click();
    await page.evaluate(() => {
      selectIds([project.clips[0].id]);
      seek(0.6);
    });
    await page.locator("#layoutPanel").evaluate((e) => (e.open = true));
    await page.locator("#visualZoom").fill("2");
    await page.locator("#visualZoom").dispatchEvent("input");
    await page.locator("#visualZoom").dispatchEvent("change");
    assert.equal(await page.evaluate(() => first().zoom.from), 2);
    await page.locator("#resetFrame").click();
    assert.equal(await page.evaluate(() => first().zoom), undefined);
    // Ctrl+S works while a property field has focus.
    await page.locator("#clipStart").focus();
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Progetto salvato"),
    );
    const saved = JSON.parse(await fs.readFile(bundled(save), "utf8"));
    assert.equal(saved.trackHeights[2], 170);
    assert.ok(saved.clips[0].mono);
    assert.equal(saved.clips.at(-2).effect.type, "pixel");
    const recovery = path.join(
      await app.evaluate(({ app }) => app.getPath("userData")),
      "recovery.creastudio",
    );
    await page.evaluate(() => {
      project.clips[0].start -= 0.1;
      changed();
    });
    await page.clock.fastForward(61000);
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent.indexOf("non riuscito") <
        0,
    );
    let auto;
    for (let i = 0; i < 50; i++) {
      try {
        auto = JSON.parse(await fs.readFile(recovery, "utf8"));
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    assert.ok(auto, "one-minute timer writes a recovery snapshot");
    assert.equal(auto.project.clips[0].start, saved.clips[0].start - 0.1);
    await page.evaluate(async () => applyOpened(await studio.recover()));
    assert.equal(
      await page.evaluate(() => project.clips[0].start),
      auto.project.clips[0].start,
    );
    await app.evaluate(({ dialog }, save) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [save],
      });
    }, bundled(save));
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.locator("#openProject").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent === "Progetto aperto.",
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(JSON.stringify(project))),
      resolvedProject(saved, bundled(save)),
    );
    const exported = path.join(temp, "reopened.mp4");
    await app.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, exported);
    await page.locator("#exportBtn").click();
    await page.locator("#exportHeight").selectOption("720");
    await page.locator("#exportFps").fill("12");
    await page.locator("#doExport").click();
    await page.waitForFunction(
      () =>
        document
          .getElementById("exportStatus")
          .textContent.startsWith("Salvato in"),
      {},
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator("#exportProgress").getAttribute("value"),
      "100",
    );
    const meta = JSON.parse(
      (
        await run(require("ffprobe-static").path, [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          exported,
        ])
      ).stdout,
    );
    assert.ok(meta.streams.some((s) => s.codec_name === "h264"));
    assert.ok(meta.streams.some((s) => s.codec_name === "aac"));
    await page.locator("#exportDialog .close").click();
    // Workspace layout is local user preference and survives a renderer restart.
    await page.reload();
    assert.equal(
      await page
        .locator(".library")
        .evaluate((e) => Math.round(e.getBoundingClientRect().width)),
      libraryWidth,
    );
    await page.locator("#resetPanels").click();
    assert.equal(
      await page
        .locator(".library")
        .evaluate((e) => Math.round(e.getBoundingClientRect().width)),
      265,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS new UI: paused seeking, playhead drag, snap, audio processing/mute, independent track resize, panels, timed effect resize, text wrapping, cross-track groups, 640 px/s, preview quality, Ctrl+S, recovery and project roundtrip.",
    );
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
