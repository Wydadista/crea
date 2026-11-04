const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
    require("node:child_process").execFile,
  ),
  ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path,
  { renderProject } = require("../src/render");
(async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "akhbar-preview-selection-"),
  );
  let app;
  try {
    const source = path.join(dir, "news.mp4");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=320x180:r=10:d=3,geq=r='if(gte(Y,160),255,if(lt(N,10),255,0))':g='if(gte(Y,160),255,if(between(N,10,19),160,0))':b='if(gte(Y,160),0,if(gte(N,20),255,0))'",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      source,
    ]);
    app = await _electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      env: {
        ...process.env,
        DISPLAY: ":99",
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof joinSelected === "function");
    await page.evaluate(async (file) => {
      await imported(await studio.importPaths([file]));
      window.fixtureMedia = clone(project.media);
    }, source);
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    async function reset(joined = true) {
      await page.evaluate((joined) => {
        pause();
        resetPlayers();
        project = Timeline.empty();
        project.canvasSize = { width: 320, height: 180 };
        project.media = clone(fixtureMedia);
        project.clips = [
          {
            id: "root",
            mediaId: project.media[0].id,
            track: 0,
            start: 0,
            in: 0,
            out: 3,
            speed: 1,
            volume: 0,
            sourceInstanceId: "source",
          },
        ];
        for (const t of [0.5, 1, 1.5, 2, 2.5])
          Timeline.split(
            project.clips,
            project.clips.map((c) => c.id),
            t,
            uid,
          );
        project.clips = project.clips
          .filter((c) => [0, 1, 2].includes(c.in))
          .sort((a, b) => a.in - b.in);
        project.clips.forEach((c, i) => (c.start = i * 0.5));
        selection = new Set(project.clips.map((c) => c.id));
        previewFocus = project.clips[0].id;
        time = 0.75;
        if (joined) Timeline.groupSelected(project.clips, [...selection], uid);
        history = [];
        future = [];
        $("previewScale").value = "fit";
        render();
      }, joined);
      await page.waitForFunction(() =>
        [...players.values()].some((p) => p.element.readyState >= 2),
      );
    }
    async function resize() {
      const p = await page.evaluate(() => {
        const r = previewRect();
        return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
      });
      await page.mouse.click(p.x, p.y);
      const b = await page.evaluate(() => {
        const c = first(),
          b = previewBox(c),
          r = previewRect();
        return {
          x: r.left + ((b.x + b.width / 2) * r.width) / 100,
          y: r.top + ((b.y + b.height) * r.height) / 100,
          delta: r.height * 0.25,
        };
      });
      const proxy = await page
        .locator('.preview-transform-handle[data-handle="s"]')
        .boundingBox()
        .catch(() => null);
      const x = proxy ? proxy.x + proxy.width / 2 : b.x,
        y = proxy ? proxy.y + proxy.height / 2 : b.y - 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + b.delta, { steps: 8 });
      await page.mouse.up();
    }
    await reset(true);
    await resize();
    let p = await page.evaluate(() => clone(project));
    assert.equal(
      p.clips.filter((c) => c.layout?.height > 115).length,
      3,
      "every joined cut must receive the preview resize",
    );
    assert.deepEqual(
      p.clips.map((c) => c.layout),
      Array(3).fill(p.clips[0].layout),
    );
    assert.equal(await page.evaluate(() => history.length), 1);
    await page.evaluate(() => undo(history, future));
    assert.equal(
      await page.evaluate(() => project.clips.some((c) => c.layout)),
      false,
    );
    await page.evaluate(() => undo(future, history));
    p = await page.evaluate(() => clone(project));
    // Pixel evidence in the preview at every retained source interval.
    for (const [at, channel] of [
      [0.25, 0],
      [0.75, 1],
      [1.25, 2],
    ]) {
      await page.evaluate((t) => seek(t, true), at);
      await page.waitForFunction((channel) => {
        const cv = $("previewCanvas"),
          pixel = cv
            .getContext("2d")
            .getImageData(cv.width / 2, cv.height * 0.9, 1, 1).data;
        return (
          pixel[channel] > (channel === 1 ? 100 : 200) &&
          pixel[(channel + 1) % 3] < 40
        );
      }, channel);
    }
    const out = path.join(dir, "cropped.mp4");
    await renderProject(
      p,
      out,
      { height: "original", fps: 10, quality: 95, encoder: "cpu" },
      { ffmpeg, ffprobe },
    );
    const { stdout } = await run(
      ffmpeg,
      [
        "-v",
        "error",
        "-i",
        out,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: 5 * 1024 * 1024 },
    );
    assert.equal(stdout.length / (320 * 180 * 3), 15);
    for (let f = 0; f < 15; f++) {
      const channel = Math.floor(f / 5),
        i = ((f * 180 + 165) * 320 + 160) * 3,
        rgb = [...stdout.subarray(i, i + 3)];
      assert.ok(
        rgb[channel] > (channel === 1 ? 100 : 200) &&
          rgb.filter((_, i) => i !== channel).every((v) => v < 45),
        `frame ${f}: discarded toolbar or source cut reappeared: ${rgb}`,
      );
    }
    await reset(false);
    await resize();
    assert.equal(
      await page.evaluate(
        () => project.clips.filter((c) => c.layout?.height > 115).length,
      ),
      3,
      "manual multi-selection must survive the preview click",
    );
    assert.equal(await page.evaluate(() => selection.size), 3);
    // Every proxy handle remains inside the preview, even after the frame grew past it.
    const handles = await page
      .locator(".preview-transform-handle")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect(),
            parent = n.parentElement.getBoundingClientRect();
          return {
            inside:
              r.left >= parent.left &&
              r.top >= parent.top &&
              r.right <= parent.right &&
              r.bottom <= parent.bottom,
          };
        }),
      );
    assert.equal(handles.length, 8);
    assert.ok(handles.every((h) => h.inside));
    await resize();
    assert.equal(
      await page.evaluate(
        () => project.clips.filter((c) => c.layout?.height > 140).length,
      ),
      3,
    );
    // Synthetic media can be extended from either edge without a source-time limit at zero.
    const photo = path.join(dir, "photo.png");
    await run(ffmpeg, [
      "-v",
      "error",
      "-i",
      source,
      "-frames:v",
      "1",
      "-threads",
      "2",
      photo,
    ]);
    await page.evaluate(async (file) => {
      await imported(await studio.importPaths([file]));
      const image = clone(project.media.find((m) => m.kind === "image"));
      const p = Timeline.empty();
      p.media = [
        image,
        {
          id: "text-media",
          name: "text",
          kind: "annotation",
          duration: 86400,
          hasAudio: false,
        },
        {
          id: "effect-media",
          name: "blur",
          kind: "effect",
          duration: 86400,
          hasAudio: false,
        },
      ];
      while (Timeline.trackCount(p) < 3) Timeline.addTrack(p);
      const base = { start: 4, in: 0, out: 2, speed: 1, volume: 0 };
      p.clips = [
        { ...base, id: "image", mediaId: image.id, track: 0 },
        {
          ...base,
          id: "text",
          mediaId: "text-media",
          track: 1,
          annotation: {
            type: "text",
            text: "Titolo",
            font: "Arial",
            size: 32,
            color: "#ffffff",
            background: "#000000",
            backgroundEnabled: false,
            x: 50,
            y: 50,
            length: 30,
            angle: 0,
            lineWidth: 4,
            animate: 0,
          },
        },
        {
          ...base,
          id: "effect",
          mediaId: "effect-media",
          track: 2,
          effect: {
            type: "blur",
            strength: 10,
            x: 10,
            y: 10,
            width: 40,
            height: 40,
            shape: "rect",
          },
        },
      ];
      applyOpened(p);
      fitTimeline = false;
      scale = 40;
      rippleFamily = false;
      history = [];
      future = [];
      renderTimeline();
    }, photo);
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    for (const id of ["image", "text", "effect"]) {
      const node = page.locator(`.clip[data-id="${id}"]`);
      await node.scrollIntoViewIfNeeded();
      let r = await node.locator(".handle.left").boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 - 80, r.y + r.height / 2, {
        steps: 6,
      });
      await page.mouse.up();
      const c = await page.evaluate(
        (id) => clone(project.clips.find((c) => c.id === id)),
        id,
      );
      assert.ok(Math.abs(c.start - 2) < 0.1, `${id}: left edge did not extend`);
      assert.ok(Math.abs(c.start + (c.out - c.in) / c.speed - 6) < 0.1);
      r = await node.locator(".handle.right").boundingBox();
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2, {
        steps: 6,
      });
      await page.mouse.up();
      assert.ok(
        await page.evaluate((id) => {
          const c = project.clips.find((c) => c.id === id);
          return c.start + (c.out - c.in) / c.speed > 6.8;
        }, id),
      );
    }
    // Smaller preview panels keep playback, the position slider and time within the player.
    assert.equal(await page.locator("#panPreview").isVisible(), false);
    assert.equal(await page.locator("#audioMeter").isVisible(), false);
    assert.equal(await page.locator("#compactTimeline").isVisible(), false);
    await page.evaluate(() => {
      panelLayout.timeline = innerHeight;
      applyPanels();
      draw();
    });
    for (const selector of ["#playBtn", "#projectSeek", "#projectSeekTime"]) {
      const inside = await page.locator(selector).evaluate((n) => {
        const r = n.getBoundingClientRect(),
          v = document.querySelector(".viewer").getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        const visible = n === hit || n.contains(hit);
        if (!visible)
          console.log(
            "clipped player",
            n.id,
            r.y,
            r.bottom,
            v.y,
            v.bottom,
            hit?.className,
          );
        return (
          visible &&
          r.width > 0 &&
          r.height > 0 &&
          r.top >= v.top &&
          r.bottom <= v.bottom &&
          r.left >= v.left &&
          r.right <= v.right
        );
      });
      assert.ok(inside, selector + " clipped in small preview");
    }
    // The recorder has no editable name; native IPC reserves local-date filenames.
    const folder = path.join(dir, "recordings");
    await page.evaluate(async (folder) => {
      await studio.setPreferences({ recordings: folder });
      await studio.recordingToolbar({ active: false, time: "00:00" });
    }, folder);
    const recorderWindow =
      app.windows().find((w) => w.url().endsWith("toolbar.html")) ||
      (await app.waitForEvent("window", { timeout: 10000 }));
    assert.ok(recorderWindow);
    await recorderWindow.waitForLoadState();
    assert.equal(await recorderWindow.locator("input").count(), 0);
    for (let i = 1; i <= 2; i++) {
      await page.evaluate(() =>
        studio.beginRecording({
          name: "Ignored custom title",
          format: "webm",
          height: 720,
          fps: 10,
          quality: 70,
          audioBitrate: 128,
        }),
      );
      const files = await fs.readdir(folder);
      assert.ok(
        files.some((n) =>
          new RegExp("^\\d{2}-\\d{2}-\\d{4}-" + i + "\\.webm$").test(n),
        ),
        files.join(","),
      );
      await page.evaluate(() => studio.abortRecording());
    }
    await page.evaluate(() => studio.closeRecorder());
    await page.screenshot({ path: "/tmp/akhbar-studio-0.4.17-ui.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real preview-handle gesture on joined and selected cuts; same crop everywhere, one undo/redo; all 15 exported frames retain source cuts and exclude the bottom toolbar",
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
