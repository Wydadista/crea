const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-precision-"));
  let app;
  try {
    const input = path.join(dir, "ten-seconds.mp4"),
      saved = path.join(dir, "precision.creastudio");
    await run(require("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=30",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=(0.25+0.05*sin(2*PI*17*t))*sin(2*PI*(220+40*floor(t/0.5))*t):s=48000",
      "-t",
      "10",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      input,
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
      ({ dialog }, { input, saved }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [input],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: saved,
        });
      },
      { input, saved },
    );
    await page.waitForFunction(
      () => document.querySelectorAll(".track").length === 1,
    );
    assert.equal(await page.locator(".track").count(), 1);
    assert.equal(await page.locator("#activeTrack option").count(), 1);
    await page.locator("#importBtn").click();
    await page.waitForFunction(() => project.media.length === 1);
    await page.locator(".media-card button").click();
    // Actual split implementation, not 20 independently imported files.
    await page.evaluate(() => {
      const id = project.clips[0].id;
      for (let t = 9.5; t > 0; t -= 0.5)
        Timeline.split(project.clips, [id], t, uid);
      render();
    });
    assert.equal(await page.locator(".clip").count(), 20);
    await page.waitForFunction(
      () => waves.get(project.media[0].id)?.rate === 2000,
    );
    await page.evaluate(async () => {
      await transport.prepare(project);
      transport.init();
      await transport.context.resume();
      // Probe runs on the audio render thread, timestamps every sample block.
      await transport.context.audioWorklet.addModule("../test/pcm-probe.js");
      window.capture = [];
      window.captureNode = new AudioWorkletNode(transport.context, "pcm-probe");
      captureNode.port.onmessage = (e) =>
        capture.push({
          frame: e.data.frame,
          at: e.data.frame / transport.context.sampleRate,
          samples: Array.from(e.data.samples),
        });
      const silent = transport.context.createGain();
      silent.gain.value = 0;
      transport.analyser.connect(captureNode);
      captureNode.connect(silent);
      silent.connect(transport.context.destination);
    });
    const starts = [
      ...Array(20).keys(),
      ...Array.from({ length: 20 }, (_, i) => 19 - i),
    ];
    const measurements = [];
    for (const index of starts) {
      const at = index * 0.5;
      await page.evaluate((t) => {
        pause();
        seek(t);
        capture = [];
      }, at);
      await page.locator("#playBtn").click();
      await page.waitForFunction((t) => playing && time >= t + 0.16, at);
      const result = await page.evaluate(async (t) => {
        const item = transport.scheduled.find(
            (s) => Math.abs(s.start - t) < 1e-9,
          ),
          p = players.get(
            project.clips.find((c) => Math.abs(c.start - t) < 1e-9).id,
          );
        const samples = capture.flatMap((c) => c.samples);
        let power = 0,
          crossings = 0;
        for (let i = 0; i < samples.length; i++) {
          power += samples[i] ** 2;
          if (i && samples[i - 1] <= 0 && samples[i] > 0) crossings++;
        }
        const rms = Math.sqrt(power / Math.max(1, samples.length));
        const anchor = transport.anchor,
          rate = transport.context.sampleRate,
          startFrame = Math.ceil(anchor * rate),
          length = Math.round(rate * 0.08),
          actual = new Float32Array(length),
          seen = new Uint8Array(length);
        for (const block of capture)
          block.samples.forEach((v, i) => {
            const at = block.frame + i - startFrame;
            if (at >= 0 && at < length) {
              actual[at] = v;
              seen[at] = 1;
            }
          });
        const c = project.clips.find((c) => Math.abs(c.start - t) < 1e-9),
          buffer = await transport.buffer(c, mediaOf(c), 0),
          expected = buffer.getChannelData(0),
          offset = Math.round(t * rate);
        let error = Infinity;
        for (let shift = -2; shift <= 2; shift += 1 / 16) {
          let square = 0;
          for (let i = 3; i < length - 3; i++) {
            const at = offset + i + shift,
              lo = Math.floor(at),
              f = at - lo;
            const value =
              (expected[lo] || 0) * (1 - f) + (expected[lo + 1] || 0) * f;
            square += (actual[i] - value) ** 2;
          }
          error = Math.min(error, Math.sqrt(square / (length - 6)));
        }
        const captured = seen.every((v) => v === 1);
        const first = capture.find(
          (c) =>
            c.frame >= startFrame && c.samples.some((v) => Math.abs(v) > 0.02),
        );
        const video = p.element.currentTime;
        const now = time;
        pause();
        return {
          item,
          rms,
          error,
          captured,
          crossings,
          video,
          now,
          first: first?.at,
          anchor,
          samples: samples.length,
          pool: videoPool.size,
        };
      }, at);
      assert.ok(
        result.item,
        "every start has its own scheduled audio interval",
      );
      assert.equal(result.item.offset, at);
      assert.equal(result.item.duration, 0.5);
      assert.ok(
        result.captured,
        `missing render-thread sample block in cut ${index}`,
      );
      assert.ok(
        result.error < 0.003,
        `beginning of cut ${index} differs from source PCM: ${result.error}`,
      );
      assert.ok(
        result.rms > 0.08,
        `audible PCM for cut ${index}: ${JSON.stringify(result)}`,
      );
      assert.ok(
        result.first - result.anchor < 0.085,
        `late audio cut ${index}: ${result.first - result.anchor}`,
      );
      assert.ok(
        Math.abs(result.video - result.now) < 0.1,
        `video sync cut ${index}`,
      );
      assert.equal(result.pool, 1, "contiguous cuts reuse one video decoder");
      measurements.push({
        index,
        onsetMs: Math.round((result.first - result.anchor) * 1000),
        syncMs: Math.round((result.video - result.now) * 1000),
        pcmError: result.error,
      });
    }
    // Continuous playback crosses all boundaries with no restart, gap or decoder replacement.
    await page.evaluate(() => {
      seek(0);
      capture = [];
    });
    await page.locator("#playBtn").click();
    await page.waitForFunction(
      () => !playing && time >= 10,
      {},
      { timeout: 20000 },
    );
    const continuous = await page.evaluate(() => ({
      schedule: transport.scheduled,
      capture: capture.map((b) => ({
        at: b.at,
        rms: Math.sqrt(
          b.samples.reduce((s, v) => s + v * v, 0) / b.samples.length,
        ),
      })),
    }));
    assert.equal(continuous.schedule.length, 20);
    for (let i = 1; i < 20; i++)
      assert.ok(
        Math.abs(
          continuous.schedule[i].when - continuous.schedule[i - 1].when - 0.5,
        ) < 1e-9,
      );
    // A 256-frame block fully inside a cut must contain sound (no dead region at boundaries).
    const anchor = continuous.schedule[0].when;
    const internal = continuous.capture.filter(
      (b) => b.at > anchor + 0.1 && b.at < anchor + 9.9,
    );
    assert.ok(internal.length > 500);
    assert.ok(
      internal.every((b) => b.rms > 0.05),
      "continuous PCM has no silent gap",
    );
    // Cross a real 30-second PCM page boundary at a supported non-unit speed.
    const originalClips = await page.evaluate(() => clone(project.clips));
    await page.evaluate(() => {
      pause();
      project.clips = [
        {
          ...project.clips[0],
          id: uid(),
          in: 0,
          out: 10,
          start: 0,
          speed: 0.25,
        },
      ];
      time = 29.9;
      render();
      capture = [];
    });
    await page.locator("#playBtn").click();
    await page.waitForFunction(() => playing && time > 30.2);
    const boundary = await page.evaluate(() => {
      const events = clone(transport.scheduled),
        blocks = capture.filter(
          (b) =>
            b.at > transport.anchor + 0.025 && b.at < transport.anchor + 0.25,
        );
      pause();
      return {
        events,
        blocks: blocks.map((b) =>
          Math.sqrt(
            b.samples.reduce((sum, v) => sum + v * v, 0) / b.samples.length,
          ),
        ),
      };
    });
    assert.equal(boundary.events.length, 2);
    assert.ok(Math.abs(boundary.events[0].duration - 0.1) < 1e-8);
    assert.equal(boundary.events[1].offset, 30);
    assert.ok(
      Math.abs(boundary.events[1].when - boundary.events[0].when - 0.1) < 1e-8,
    );
    assert.ok(
      boundary.blocks.length > 20 && boundary.blocks.every((v) => v > 0.04),
      "real PCM crosses the page boundary without a hole",
    );
    await page.evaluate((clips) => {
      project.clips = clips;
      time = 0;
      render();
    }, originalClips);
    // Track count and scrolling; insertion into a free interval does not invent tracks.
    for (let i = 1; i < 30; i++) await page.locator("#addTrack").click();
    assert.equal(await page.locator(".track").count(), 30);
    await page.locator("#activeTrack").selectOption("29");
    await page.evaluate(() => seek(0));
    await page.locator(".media-card button").click();
    assert.equal(await page.locator(".track").count(), 30);
    await page
      .locator("#timelineScroll")
      .evaluate((e) => (e.scrollTop = e.scrollHeight));
    assert.ok(
      await page.locator('[data-choose-track="0"] .track-mute').isVisible(),
    );
    await page.locator("#timelineScroll").evaluate((e) => (e.scrollTop = 0));
    // Content and high-DPI waveform grow with this track only; time/source/volume do not change.
    await page.waitForFunction(() => document.querySelector("#track29 canvas"));
    const unchanged = await page.evaluate(() =>
      project.clips.map((c) => [c.start, c.in, c.out, c.volume]),
    );
    const waveBefore = await page.locator("#track29 canvas").evaluate((c) => ({
      h: c.height,
      w: c.width,
      css: c.getBoundingClientRect().width,
    }));
    const handle = await page
      .locator('[data-choose-track="29"] .track-resizer')
      .boundingBox();
    await page.mouse.move(handle.x + 10, handle.y + 3);
    await page.mouse.down();
    await page.mouse.move(handle.x + 10, handle.y + 123, { steps: 8 });
    await page.mouse.up();
    const waveAfter = await page
      .locator("#track29 canvas")
      .evaluate((c) => ({ h: c.height, w: c.width }));
    assert.ok(waveAfter.h > waveBefore.h + 100);
    assert.equal(
      await page
        .locator("#track28")
        .evaluate((e) => e.getBoundingClientRect().height),
      100,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        project.clips.map((c) => [c.start, c.in, c.out, c.volume]),
      ),
      unchanged,
    );
    // Occupied drag is shown red and is not committed; adjacent snapping still works.
    await page.evaluate(() => {
      selection.clear();
      seek(0);
      setZoom(100);
    });
    const top = await page.locator("#track29 .clip").boundingBox();
    await page.locator("#activeTrack").selectOption("29");
    await page.evaluate(() => (time = 12));
    await page.locator(".media-card button").click();
    const moving = await page.locator("#track29 .clip").nth(1).boundingBox();
    await page.mouse.move(moving.x + 30, moving.y + 60);
    await page.mouse.down();
    await page.mouse.move(moving.x + 30 - 400, moving.y + 60, { steps: 6 });
    assert.ok((await page.locator(".drop-ghost.invalid").count()) > 0);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => project.clips.at(-1).start), 12);
    // Dedicated drop strip creates exactly one new track for an existing clip.
    await page.locator("#timelineScroll").evaluate((e) => (e.scrollLeft = 0));
    const current = await page.locator("#track29 .clip").first().boundingBox(),
      zone = await page.locator("#newTrackDrop").boundingBox();
    await page.mouse.move(current.x + 30, current.y + 60);
    await page.mouse.down();
    await page.mouse.move(current.x + 30, zone.y + zone.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    assert.equal(await page.locator(".track").count(), 31);
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.start === 0 && c.out === 10).track,
      ),
      30,
    );
    // All track settings survive disk save/reopen, and export supports track 31.
    await page.locator("#saveProject").click();
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Progetto salvato"),
    );
    const disk = JSON.parse(await fs.readFile(bundled(saved), "utf8"));
    assert.equal(disk.trackCount, 31);
    assert.equal(disk.trackHeights[29], 220);
    await app.evaluate(({ dialog }, saved) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [saved],
      });
    }, bundled(saved));
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.locator("#openProject").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent === "Progetto aperto.",
    );
    assert.equal(await page.locator(".track").count(), 31);
    assert.equal(
      await page.evaluate(() => Timeline.overlaps(project.clips)),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS precision: 40 starts (20 forward + 20 backward), actual PCM onset/video sync, 20 continuous cuts, 31 dynamic tracks, waveform resize, collision preview/rejection, save/reopen.",
    );
    console.log("Onset/sync measurements:", JSON.stringify(measurements));
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
