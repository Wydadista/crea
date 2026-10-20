const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-workflow-"));
  let app;
  try {
    const video = path.join(dir, "Registrazione originale.mp4"),
      foreign = path.join(dir, "Altra clip.mp4"),
      image = path.join(dir, "foto.png");
    const saved = path.join(dir, "Montàggio con spazi.creastudio"),
      output = path.join(dir, "Vídeo completato è.mp4");
    const ffmpeg = require("ffmpeg-static"),
      ffprobe = require("ffprobe-static").path;
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=1536x864:r=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "10",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      video,
    ]);
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=640x360:r=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      foreign,
    ]);
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=320x160",
      "-frames:v",
      "1",
      "-threads",
      "1",
      image,
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
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog, shell }, { video, foreign, saved, output }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [video, foreign],
        });
        dialog.showSaveDialog = async (_w, o) => ({
          canceled: false,
          filePath: o.defaultPath.endsWith(".mp4") ? output : saved,
        });
        globalThis.exportOpenCalls = [];
        shell.openPath = async (p) => {
          exportOpenCalls.push(["video", p]);
          return "";
        };
        shell.showItemInFolder = (p) => exportOpenCalls.push(["folder", p]);
      },
      { video, foreign, saved, output },
    );
    await page.locator("#importBtn").click();
    await page.waitForFunction(() => project.media.length === 2);
    await page.locator(".media-card button").first().click();
    assert.deepEqual(await page.evaluate(() => Timeline.projectSize(project)), {
      width: 1536,
      height: 864,
    });
    await page.locator("#clipSpeed").fill("2,5");
    await page.locator("#clipSpeed").press("Tab");
    assert.equal(await page.evaluate(() => first().speed), 2.5);
    assert.equal(await page.evaluate(() => first().speedReference), 1);
    await page.evaluate(() => {
      const id = first().id;
      for (let i = 19; i > 0; i--)
        Timeline.split(project.clips, [id], i * 0.2, uid);
      selection = new Set(
        project.clips.filter((c, i) => [3, 8, 14].includes(i)).map((c) => c.id),
      );
      remove();
    });
    const cuts = await page.evaluate(() =>
      project.clips.map((c) => [c.id, c.in, c.out]),
    );
    await page.evaluate(() => {
      time = 4;
      addMedia(project.media[1].id, 4, 0);
      selectIds([project.clips[0].id]);
    });
    await page.locator("#selectSourceSegments").click();
    assert.equal(await page.evaluate(() => selection.size), 17);
    const fast = await page.evaluate(() => clone(project));
    await page.locator("#resetSpeed").click();
    const restored = await page.evaluate(() => clone(project));
    assert.equal(restored.trackCount, 2);
    assert.deepEqual(
      restored.clips
        .filter((c) => c.mediaId === restored.media[0].id)
        .map((c) => [c.id, c.in, c.out]),
      cuts,
    );
    const other = restored.clips.find(
      (c) => c.mediaId === restored.media[1].id,
    );
    assert.equal(other.start, 4);
    assert.equal(other.track, 0);
    assert.ok(
      restored.clips
        .filter((c) => c.mediaId === restored.media[0].id)
        .every((c) => c.speed === 1),
    );
    assert.equal(
      await page.evaluate(() => Timeline.overlaps(project.clips)),
      false,
    );
    await page.keyboard.press("Control+z");
    assert.deepEqual(await page.evaluate(() => clone(project)), fast);
    await page.keyboard.press("Control+Shift+z");
    assert.deepEqual(await page.evaluate(() => clone(project)), restored);
    // Cold start after restoration uses the same source cuts for both media clocks.
    await page.evaluate(() => seek(0));
    await page.locator("#playBtn").click();
    await page.waitForFunction(() => playing && time > 0.12);
    const sync = await page.evaluate(() => {
      const c = project.clips[0],
        p = players.get(c.id);
      const data = {
        offset: transport.scheduled[0].offset,
        video: p.element.currentTime,
        source: Timeline.sourceTime(c, time),
      };
      pause();
      return data;
    });
    assert.equal(sync.offset, restored.clips[0].in);
    assert.ok(Math.abs(sync.video - sync.source) < 0.1);
    await page.evaluate(() => {
      seek(0.02);
      selection = new Set([project.clips[0].id]);
      project.clips[0].layout = { x: 20, y: 20, width: 50, height: 50 };
      changed();
    });
    // Viewing magnification never writes project data. 100% means physical pixel size.
    const geometry = await page.evaluate(() => JSON.stringify(project));
    for (const scale of ["10", "25", "50", "75", "100", "fit"]) {
      await page.locator("#previewScale").selectOption(scale);
      if (scale !== "fit") {
        const box = await page.locator("#previewCanvas").boundingBox(),
          dpr = await page.evaluate(() => devicePixelRatio);
        assert.ok(Math.abs(box.width - (1536 * Number(scale)) / 100 / dpr) < 1);
      }
      assert.equal(
        await page.evaluate(() => JSON.stringify(project)),
        geometry,
      );
    }
    await page.locator("#previewScale").selectOption("100");
    assert.ok(
      await page
        .locator(".stage")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
    );
    const before = await page.locator(".stage").evaluate((e) => e.scrollLeft);
    await page.locator("#panPreview").click();
    let rect = await page.locator(".stage").boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width / 2 - 40,
      rect.y + rect.height / 2,
    );
    await page.mouse.up();
    assert.ok(
      (await page.locator(".stage").evaluate((e) => e.scrollLeft)) > before,
    );
    assert.equal(await page.evaluate(() => JSON.stringify(project)), geometry);
    await page.locator("#panPreview").click();
    await page.locator("#previewScale").selectOption("fit");
    // All eight handles resize immediately with proportions locked; timeline cuts stay untouched.
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (const h of handles) {
      await page.evaluate(() => {
        first().layout = { x: 20, y: 20, width: 50, height: 50 };
        draw();
      });
      const p = await page.evaluate((h) => {
        const r = previewRect(),
          point = boxHandles(previewBox(first())).find(([name]) => name === h);
        return {
          x: r.left + (point[1] / 100) * r.width,
          y: r.top + (point[2] / 100) * r.height,
        };
      }, h);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 8, p.y + 5, { steps: 4 });
      const live = await page.evaluate(() => first().layout);
      assert.notEqual(
        live.width,
        50,
        `handle ${h}: ${JSON.stringify({ p, live, selected: await page.evaluate(() => ({ id: first()?.id, box: previewBox(first()), rect: previewRect(), cursor: document.getElementById("previewCanvas").style.cursor, pan: panView })) })}`,
      );
      assert.ok(Math.abs(live.width / live.height - 1) < 1e-8);
      await page.mouse.up();
    }
    await page.locator("#lockAspect").uncheck();
    const side = await page.evaluate(() => {
      const r = previewRect(),
        p = boxHandles(previewBox(first())).find(([h]) => h === "e");
      return {
        x: r.left + (p[1] / 100) * r.width,
        y: r.top + (p[2] / 100) * r.height,
        height: first().layout.height,
      };
    });
    await page.mouse.move(side.x, side.y);
    await page.mouse.down();
    await page.mouse.move(side.x + 20, side.y);
    await page.mouse.up();
    assert.ok(
      Math.abs(
        (await page.evaluate(() => first().layout.height)) - side.height,
      ) < 1e-8,
    );
    // Hit-testing selects the visible element in both preview and timeline.
    await page.evaluate(() => {
      selection.clear();
      draw();
    });
    const point = await page.evaluate(() => {
      const r = previewRect(),
        b = previewBox(project.clips[0]);
      return {
        x: r.left + ((b.x + b.width / 2) / 100) * r.width,
        y: r.top + ((b.y + b.height / 2) / 100) * r.height,
      };
    });
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.locator(".clip.selected").count(), 1);
    assert.equal(await page.evaluate(() => first().id), restored.clips[0].id);
    // A photo supports the same handles; it does not redefine the project's resolution.
    await page.evaluate(async (file) => {
      await imported(await studio.importPaths([file]));
    }, image);
    await page.locator("#addTrack").click();
    await page.locator(".media-card button").nth(2).click();
    await page.evaluate(() => {
      first().layout = { x: 75, y: 75, width: 20, height: 20 };
      changed();
    });
    const photo = await page.evaluate(() => {
      const r = previewRect(),
        b = previewBox(first());
      return {
        x: r.left + ((b.x + b.width) / 100) * r.width,
        y: r.top + ((b.y + b.height) / 100) * r.height,
      };
    });
    await page.mouse.move(photo.x, photo.y);
    await page.mouse.down();
    await page.mouse.move(photo.x + 5, photo.y + 3);
    await page.mouse.up();
    assert.notEqual(await page.evaluate(() => first().layout.width), 20);
    assert.deepEqual(await page.evaluate(() => Timeline.projectSize(project)), {
      width: 1536,
      height: 864,
    });
    // Text and arrows share the visual transform path used by export rasterization.
    for (const type of ["Text", "Arrow"]) {
      await page.locator("#addTrack").click();
      await page.locator("#add" + type).click();
      if (type === "Text")
        await page.evaluate(() => {
          first().annotation = {
            ...first().annotation,
            text: "Titolo",
            width: 20,
            x: 60,
            y: 15,
          };
          changed();
        });
      const handle = await page.evaluate(() => {
        const r = previewRect(),
          b = previewBox(first());
        return {
          x: r.left + ((b.x + b.width) / 100) * r.width,
          y: r.top + ((b.y + b.height) / 100) * r.height,
        };
      });
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      await page.mouse.move(handle.x + 7, handle.y + 3, { steps: 3 });
      await page.mouse.up();
      assert.notEqual(
        await page.evaluate(() => first().layout?.width),
        undefined,
      );
    }
    // Keep a simple frame geometry for comparison against the actual encoded output.
    await page.evaluate(() => {
      project.clips[0].layout = { x: 25, y: 25, width: 50, height: 50 };
      changed();
    });
    await page.locator("#saveProject").click();
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Progetto salvato"),
    );
    const disk = JSON.parse(await fs.readFile(saved, "utf8"));
    assert.deepEqual(disk.canvasSize, { width: 1536, height: 864 });
    assert.ok(disk.clips.some((c) => c.layout));
    await app.evaluate(({ dialog }, saved) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [saved],
      });
    }, saved);
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.locator("#openProject").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent === "Progetto aperto.",
    );
    assert.deepEqual(await page.evaluate(() => clone(project)), disk);
    await page.locator("#exportBtn").click();
    assert.ok(await page.locator("#exportResultActions").isHidden());
    assert.match(
      await page.locator("#originalResolution").textContent(),
      /1536.*864/,
    );
    assert.equal(
      await page.evaluate(() =>
        studio.openExport("video").then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    await page.locator("#exportHeight").selectOption("original");
    await page.locator("#exportFps").fill("12");
    await page.locator("#exportQuality").fill("55");
    await page.locator("#doExport").click();
    assert.ok(await page.locator("#exportResultActions").isHidden());
    await page.waitForFunction(
      () =>
        document
          .getElementById("exportStatus")
          .textContent.startsWith("Salvato in"),
      {},
      { timeout: 120000 },
    );
    const meta = JSON.parse(
        (
          await run(ffprobe, [
            "-v",
            "error",
            "-show_streams",
            "-of",
            "json",
            output,
          ])
        ).stdout,
      ),
      v = meta.streams.find((s) => s.codec_type === "video");
    assert.equal(v.width, 1536);
    assert.equal(v.height, 864);
    assert.ok(meta.streams.some((s) => s.codec_name === "aac"));
    const caption = disk.clips.find((c) => c.annotation?.type === "text"),
      l = caption.layout;
    const { stdout: captionPixels } = await run(
      ffmpeg,
      [
        "-v",
        "error",
        "-i",
        output,
        "-frames:v",
        "1",
        "-vf",
        "format=rgb24,crop=600:200:600:0",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: 2e6 },
    );
    let white = 0;
    for (let i = 0; i < captionPixels.length; i += 3)
      if (
        captionPixels[i] > 180 &&
        captionPixels[i + 1] > 180 &&
        captionPixels[i + 2] > 180
      )
        white++;
    assert.ok(white > 100, "resized caption is visible in the encoded video");
    await page.locator("#openExportVideo").click();
    await page.locator("#openExportFolder").click();
    assert.deepEqual(await app.evaluate(() => globalThis.exportOpenCalls), [
      ["video", output],
      ["folder", output],
    ]);
    assert.equal(
      await page.locator("#exportProgress").getAttribute("value"),
      "100",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS workflow: work-speed restore with deleted sections/foreign clip, undo/redo, playback sync, six view scales/pan, eight aspect handles, photo selection, original-resolution saved/reopened export and native open actions with Unicode paths.",
    );
  } finally {
    await app?.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
