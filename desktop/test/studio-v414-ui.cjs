const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
    require("node:child_process").execFile,
  ),
  ffmpeg = require("ffmpeg-static");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-v414-ui-"));
  let app;
  try {
    const source = path.join(dir, "news.mp4"),
      picture = path.join(dir, "stinger.mp4"),
      music = path.join(dir, "music.wav");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=160x90:r=10",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=900:sample_rate=48000",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      source,
    ]);
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=160x90:r=10",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      picture,
    ]);
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=6",
      "-ac",
      "2",
      music,
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
        DISPLAY: process.env.DISPLAY || ":99",
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        typeof Timeline.insertStinger === "function" &&
        !!document.getElementById("railTransitions"),
    );
    await page.evaluate(
      async (files) => {
        await imported(await studio.importPaths(files));
        window.testMedia = clone(project.media);
      },
      [source, picture, music],
    );
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    await page.evaluate(() => {
      const m = testMedia.find((m) => m.name === "news.mp4");
      const p = Timeline.empty();
      p.media = clone(testMedia);
      p.canvasSize = { width: 160, height: 90 };
      p.clips = [
        {
          id: "a",
          mediaId: m.id,
          sourceInstanceId: "a",
          track: 0,
          start: 0,
          in: 0,
          out: 6,
          speed: 1,
          volume: 1,
        },
        {
          id: "b",
          mediaId: m.id,
          sourceInstanceId: "b",
          track: 0,
          start: 80,
          in: 0,
          out: 6,
          speed: 1,
          volume: 1,
        },
      ];
      applyOpened(p);
      fitTimeline = false;
      scale = 40;
      rippleFamily = true;
      renderTimeline();
    });
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    const node = page.locator('.clip[data-id="b"]');
    await node.scrollIntoViewIfNeeded();
    let r = await node.locator(".handle.left").boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    let c = await page.evaluate(() =>
      clone(project.clips.find((c) => c.id === "b")),
    );
    assert.equal(c.start, 80);
    assert.ok(c.in > 0.8 && c.in < 1.2);
    await page.evaluate(() => {
      selection = new Set(["b"]);
      previewFocus = "b";
      time = 81;
      showContext(600, 400);
    });
    const actions = await page
      .locator("#contextMenu button")
      .evaluateAll((ns) => ns.map((n) => n.dataset.action));
    for (const hidden of ["copy", "cut", "paste", "split", "source-speed"])
      assert.ok(!actions.includes(hidden));
    assert.match(
      await page.locator('[data-action="mute"]').textContent(),
      /🔇/,
    );
    await page.locator('[data-action="edit-volume"]').click();
    await page.locator('.clip[data-id="b"] .volume-add-point').click();
    assert.equal(
      await page.locator('.clip[data-id="b"] .volume-point').count(),
      3,
    );
    const beforeGain = await page.evaluate(() => history.length);
    const point = page.locator('.clip[data-id="b"] .volume-point').nth(1),
      area = await page
        .locator('.clip[data-id="b"] .clip-volume-control')
        .boundingBox();
    r = await point.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      r.x + r.width / 2 + 12,
      r.y + r.height / 2 + area.height * 0.25,
      { steps: 5 },
    );
    await page.mouse.up();
    c = await page.evaluate(() =>
      clone(project.clips.find((c) => c.id === "b")),
    );
    assert.equal(c.start, 80);
    assert.ok(c.volumePoints[1].value < 0.6 && c.volumePoints[1].value > 0.35);
    assert.equal(await page.evaluate(() => history.length), beforeGain + 1);
    await page.evaluate(() => undo(history, future));
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "b").volumePoints[1].value,
      ),
      1,
    );
    await page.evaluate(() => undo(future, history));
    await page
      .locator('.clip[data-id="b"] .volume-point')
      .nth(1)
      .click({ button: "right" });
    await page.locator("#volumePointMenu button").click();
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "b").volumePoints.length,
      ),
      2,
    );
    const liveGain = await page.evaluate(async () => {
      const offline = new OfflineAudioContext(1, Math.ceil(2.1 * 48000), 48000);
      const context = {
        currentTime: 0,
        destination: offline.destination,
        resume: async () => {},
        createGain: () => offline.createGain(),
        createAnalyser: () => offline.createAnalyser(),
        createBufferSource: () => offline.createBufferSource(),
      };
      const c = {
        id: "live",
        mediaId: "m",
        start: 0,
        in: 1,
        out: 5,
        speed: 2,
        volume: 0,
        volumePoints: [
          { time: 1, value: 0 },
          { time: 3, value: 1 },
          { time: 5, value: 0 },
        ],
      };
      const p = {
        ...Timeline.empty(),
        media: [{ id: "m", hasAudio: true }],
        clips: [c],
      };
      const tr = new AudioTransport(null, context),
        buffer = offline.createBuffer(1, 6 * 48000, 48000);
      buffer.getChannelData(0).fill(0.1);
      tr.buffer = async () => buffer;
      try {
        await tr.start(p, 0);
        const audio = await offline.startRendering();
        return [0.5, 1, 1.5].map(
          (t) => audio.getChannelData(0)[Math.round((t + 0.035) * 48000)],
        );
      } finally {
        tr.stop();
      }
    });
    assert.ok(Math.abs(liveGain[0] - 0.05) < 0.002);
    assert.ok(Math.abs(liveGain[1] - 0.1) < 0.002);
    assert.ok(Math.abs(liveGain[2] - 0.05) < 0.002);
    // Named markers change project metadata, not any clip or media property.
    const beforeMarker = await page.evaluate(() =>
      JSON.stringify(project.clips),
    );
    await page.locator("#addTimelineMarker").click();
    await page.locator("#studioNameDialog input").fill("Inizio argomento");
    await page.locator("#studioNameDialog input").press("Enter");
    await page.waitForFunction(() => project.markers?.length === 1);
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips)),
      beforeMarker,
    );
    await page.locator(".timeline-marker").waitFor();
    r = await page.locator(".timeline-marker").boundingBox();
    await page.mouse.move(r.x + 4, r.y + 5);
    await page.mouse.down();
    await page.mouse.move(r.x + 44, r.y + 5, { steps: 4 });
    await page.mouse.up();
    assert.ok(
      Math.abs((await page.evaluate(() => project.markers[0].time)) - 82) < 0.1,
    );
    await page.locator(".timeline-marker").click({ button: "right" });
    await page
      .locator("#appDialogActions button")
      .filter({ hasText: "Rinomina" })
      .click();
    await page.locator("#studioNameDialog input").fill("Aggiungere foto");
    await page.locator("#studioNameDialog input").press("Enter");
    await page.waitForFunction(
      () => project.markers[0].name === "Aggiungere foto",
    );
    assert.equal(
      await page.evaluate(() => project.markers[0].name),
      "Aggiungere foto",
    );
    // Save a stinger, open a different project and insert it from the collection.
    await page.evaluate(() => {
      const p = Timeline.empty();
      Timeline.addTrack(p);
      p.media = clone(testMedia);
      p.canvasSize = { width: 160, height: 90 };
      const v = p.media.find((m) => m.name === "stinger.mp4"),
        a = p.media.find((m) => m.kind === "audio");
      p.clips = [
        {
          id: "sv",
          mediaId: v.id,
          track: 0,
          start: 0,
          in: 0,
          out: 4,
          speed: 1,
          volume: 1,
        },
        {
          id: "sa",
          mediaId: a.id,
          track: 1,
          start: 0,
          in: 0,
          out: 6,
          speed: 1,
          volume: 1,
        },
      ];
      applyOpened(p);
      selection = new Set(["sv", "sa"]);
      scale = 40;
      fitTimeline = false;
      renderTimeline();
    });
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    await page.locator("#railTransitions").click();
    await page.locator("#saveStinger").click();
    await page.locator("#studioNameDialog input").fill("Notizie 4 + 6");
    await page.locator("#studioNameDialog input").press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector(".stinger-card strong")?.textContent ===
        "Notizie 4 + 6",
    );
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    await page.evaluate(() => {
      const p = Timeline.empty();
      p.media = clone(testMedia.filter((m) => m.name === "news.mp4"));
      p.canvasSize = { width: 160, height: 90 };
      p.clips = [
        {
          id: "news",
          mediaId: p.media[0].id,
          track: 0,
          start: 0,
          in: 0,
          out: 6,
          speed: 1,
          volume: 1,
        },
      ];
      p.markers = [{ id: "mark", time: 0, name: "Notizia" }];
      applyOpened(p);
      time = 0;
      scale = 40;
      fitTimeline = false;
      renderTimeline();
    });
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    await page.locator("#railTransitions").click();
    await page.locator(".stinger-insert").click();
    await page.waitForFunction(() => project.clips.length === 3);
    const inserted = await page.evaluate(() => clone(project));
    assert.equal(inserted.clips.find((c) => c.id === "news").start, 4);
    assert.equal(inserted.markers[0].time, 4);
    const stingers = inserted.clips.filter((c) => c.stingerId);
    assert.equal(stingers.length, 2);
    assert.equal(stingers[0].linkId, stingers[1].linkId);
    assert.deepEqual(
      stingers.map((c) => (c.out - c.in) / c.speed).sort(),
      [4, 6],
    );
    assert.equal(await page.locator(".stinger-clip").count(), 2);
    await page.evaluate(() => undo(history, future));
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    assert.equal(await page.evaluate(() => project.clips[0].start), 0);
    await page.evaluate(() => undo(future, history));
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "news").start,
      ),
      4,
    );
    // Move a reusable unit by its video; music follows by exactly the same delta.
    await page.evaluate(() => {
      time = 20;
      selection = new Set(["news"]);
      copyTimelineSelection();
      pasteTimelineSelection();
    });
    assert.ok(
      await page.evaluate(() =>
        project.clips.some((c) => c.start === 20 && !c.stingerId),
      ),
    );
    const stingerNode = page
      .locator(".stinger-clip")
      .filter({ has: page.locator(".clip-thumb") })
      .first();
    await stingerNode.scrollIntoViewIfNeeded();
    const stingerRect = await stingerNode.boundingBox();
    await page.mouse.move(
      stingerRect.x + stingerRect.width / 2,
      stingerRect.y + stingerRect.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      stingerRect.x + stingerRect.width / 2 + 12 * 40,
      stingerRect.y + stingerRect.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    const movedStinger = await page.evaluate(() =>
      project.clips.filter((c) => c.stingerId).map((c) => c.start),
    );
    assert.ok(movedStinger.every((t) => Math.abs(t - 12) < 0.1));
    await page.evaluate(() => undo(history, future));
    const gallery = await page
      .locator(".stinger-card")
      .first()
      .evaluate((n) => ({
        width: n.getBoundingClientRect().width,
        parent: n.parentElement.getBoundingClientRect().width,
        border: getComputedStyle(n).borderRadius,
      }));
    assert.ok(gallery.width < gallery.parent * 0.75);
    assert.equal(gallery.border, "10px");
    await page.evaluate(() => {
      const c = project.clips.find((c) => c.id === "news");
      project.markers = [
        Timeline.anchorMarker({ id: "follow", name: "Frase" }, c, c.start + 2),
      ];
      checkpoint();
      c.start += 30;
      changed();
    });
    assert.equal(await page.evaluate(() => project.markers[0].time), 36);
    await page.evaluate(() => undo(history, future));
    assert.equal(await page.evaluate(() => project.markers[0].time), 6);
    await page.evaluate(() => undo(future, history));
    assert.equal(await page.evaluate(() => project.markers[0].time), 36);
    await page.evaluate(() => {
      const c = project.clips.find((c) => c.id === "news");
      project.clips = [c];
      project.trackCount = 3;
      project.trackHeights = [100, 100, 100];
      project.trackMuted = [false, false, false];
      selection = new Set([c.id]);
      previewFocus = c.id;
      time = c.start + 1;
      render();
    });
    await page.locator("#freezeFrame").click();
    await page.waitForFunction(() => project.clips.length === 2);
    assert.equal(await page.evaluate(() => project.trackCount), 3);
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id !== "news").track,
      ),
      1,
    );
    await page.evaluate(() => undo(history, future));
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    await page.evaluate(() => {
      const c = project.clips[0];
      c.start = 0;
      c.in = 0;
      c.out = 6;
      c.speed = 0.25;
      selection = new Set([c.id]);
      previewFocus = c.id;
      time = 3;
      scale = 400;
      fitTimeline = false;
      renderTimeline();
      properties();
      if (
        document
          .getElementById("editClipVolume")
          .getAttribute("aria-pressed") !== "true"
      )
        document.getElementById("editClipVolume").click();
      document.getElementById("timelineScroll").scrollLeft = 1000;
    });
    await page.waitForTimeout(100);
    const checkPinned = async () => {
      const b = await page.locator(".volume-add-point").evaluate((n) => {
        const r = n.getBoundingClientRect(),
          v = document.getElementById("timelineScroll").getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          vl: v.left,
          vr: v.left + document.getElementById("timelineScroll").clientWidth,
          hidden: n.hidden,
        };
      });
      assert.equal(b.hidden, false);
      assert.ok(b.left >= b.vl && b.right <= b.vr);
    };
    await checkPinned();
    await page.evaluate(() => {
      scale = 800;
      renderTimeline();
      document.getElementById("timelineScroll").scrollLeft = 2000;
    });
    await page.waitForTimeout(100);
    await checkPinned();
    await page.locator(".volume-add-point").click();
    assert.ok(
      await page.evaluate(() =>
        project.clips[0].volumePoints?.some(
          (p) => Math.abs(p.time - 0.75) < 0.01,
        ),
      ),
    );
    await page.screenshot({ path: "/tmp/akhbar-0.4.15-ui.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: trim gap, volume automation and pinned plus at two zoom levels, clip markers with undo/redo, compact stinger gallery and linked insertion, freeze frame on an existing empty track, clipboard and playback",
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
