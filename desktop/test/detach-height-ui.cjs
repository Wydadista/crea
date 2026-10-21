const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path,
  { renderProject } = require("../src/render");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-detach-"));
  let app;
  try {
    const input = path.join(dir, "source.mp4");
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
      "8",
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
    const originalBytes = await fs.readFile(input);
    app = await electron.launch({
      args: [path.resolve(__dirname, ".."), "--no-sandbox", "--disable-gpu"],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof detachSelectedAudio === "function");
    await page.evaluate(
      async ({ input, dir }) => {
        await imported(await studio.importPaths([input]));
        await studio.setPreferences({ projects: dir });
        Timeline.addTrack(project);
        const m = project.media[0];
        project.clips = [
          {
            id: "video",
            mediaId: m.id,
            start: 1,
            in: 2,
            out: 6,
            track: 0,
            speed: 2,
            volume: 0.7,
            mono: true,
            voice: { noise: 0.1, level: 0 },
          },
          {
            id: "other",
            mediaId: m.id,
            start: 7,
            in: 0,
            out: 1,
            track: 1,
            speed: 1,
            volume: 0,
          },
        ];
        scale = 80;
        selection.clear();
        panelLayout.timeline = 400;
        applyPanels();
        render();
      },
      { input, dir },
    );
    const before = await page.evaluate(() => structuredClone(project));
    await page
      .locator('[data-id="video"]')
      .click({ button: "right", position: { x: 30, y: 20 } });
    assert.ok(await page.locator('[data-action="detach-audio"]').isEnabled());
    await page.locator('[data-action="detach-audio"]').click();
    const detached = await page.evaluate(() => structuredClone(project));
    const audio = detached.clips.find((c) => c.detachedFrom === "video");
    assert.ok(audio);
    assert.equal(audio.track, 1);
    assert.equal(detached.clips[0].track, 0);
    assert.equal(detached.clips[0].muted, true);
    assert.equal(detached.clips.find((c) => c.id === "other").start, 7);
    for (const key of [
      "start",
      "in",
      "out",
      "speed",
      "volume",
      "mono",
      "voice",
    ])
      assert.deepEqual(audio[key], before.clips[0][key]);
    await page
      .locator('[data-id="video"]')
      .click({ button: "right", position: { x: 30, y: 20 } });
    assert.ok(await page.locator('[data-action="detach-audio"]').isDisabled());
    await page.mouse.click(1200, 100);
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    assert.equal(await page.evaluate(() => project.clips[0].muted), undefined);
    await page.locator("#redoBtn").click();
    assert.equal(await page.evaluate(() => project.clips.length), 3);
    await page.evaluate(async () => {
      seek(1.2);
      await play();
    });
    await page.waitForFunction(() => playing && time > 1.3);
    const scheduled = await page.evaluate(() => transport.scheduled);
    assert.ok(scheduled.length);
    assert.ok(scheduled.every((s) => s.id !== "video"));
    await page.evaluate(() => pause());
    // Record actual row and content dimensions at the old and new minimum.
    const heights = [];
    for (const height of [80, 32]) {
      await page.locator("#trackHeight").fill(String(height));
      await page.locator("#trackHeight").dispatchEvent("input");
      await page.locator("#trackHeight").dispatchEvent("change");
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const dimensions = await page.evaluate(() =>
        [...document.querySelectorAll(".track")].map((row) => ({
          height: row.getBoundingClientRect().height,
          clips: [...row.querySelectorAll(".clip")].map((c) => ({
            height: c.getBoundingClientRect().height,
            thumb: c.querySelector("img")?.getBoundingClientRect().height,
            wave: c.querySelector("canvas")?.getBoundingClientRect().height,
            handles: c.querySelectorAll(".handle").length,
          })),
        })),
      );
      assert.ok(dimensions.every((r) => r.height === height));
      assert.ok(
        dimensions.every((r) =>
          r.clips.every(
            (c) => c.height < height && c.height > 12 && c.handles === 2,
          ),
        ),
      );
      heights.push(dimensions);
    }
    assert.ok(heights[1][0].height <= heights[0][0].height / 2);
    await page.locator("#undoBtn").click();
    assert.ok(
      await page.evaluate(() => project.trackHeights.every((h) => h === 80)),
    );
    await page.locator("#redoBtn").click();
    assert.ok(
      await page.evaluate(() => project.trackHeights.every((h) => h === 32)),
    );
    await page
      .locator(`[data-id="${audio.id}"]`)
      .click({ position: { x: 30, y: 10 } });
    assert.deepEqual(await page.evaluate(() => [...selection]), [audio.id]);
    const small = await page.locator(`[data-id="${audio.id}"]`).boundingBox();
    await page.mouse.move(small.x + 30, small.y + 10);
    await page.mouse.down();
    await page.mouse.move(small.x + 70, small.y + 10);
    await page.mouse.up();
    assert.equal(
      await page.evaluate(
        (id) => project.clips.find((c) => c.id === id).start,
        audio.id,
      ),
      1.5,
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "video").start,
      ),
      1,
    );
    await page.locator("#undoBtn").click();
    const edge = await page
      .locator(`[data-id="${audio.id}"] .handle.right`)
      .boundingBox();
    await page.mouse.move(edge.x + 2, edge.y + 8);
    await page.mouse.down();
    await page.mouse.move(edge.x - 6, edge.y + 8);
    await page.mouse.up();
    assert.ok(
      Math.abs(
        (await page.evaluate(
          (id) => project.clips.find((c) => c.id === id).out,
          audio.id,
        )) - 5.8,
      ) < 0.001,
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => c.id === "video").out,
      ),
      6,
    );
    await page.locator("#undoBtn").click();
    await page
      .locator(`[data-id="${audio.id}"]`)
      .click({ button: "right", position: { x: 30, y: 10 } });
    await page.locator('[data-action="mute"]').click();
    assert.equal(
      await page.evaluate(
        (id) => project.clips.find((c) => c.id === id).muted,
        audio.id,
      ),
      true,
    );
    await page.locator("#undoBtn").click();
    await page
      .locator(`[data-id="${audio.id}"]`)
      .click({ button: "right", position: { x: 30, y: 10 } });
    await page.locator('[data-action="delete"]').click();
    assert.ok(
      await page.evaluate(() => project.clips.some((c) => c.id === "video")),
    );
    assert.equal(
      await page.evaluate(
        (id) => project.clips.some((c) => c.id === id),
        audio.id,
      ),
      false,
    );
    await page.locator("#undoBtn").click();
    // Individual resizing remains independent and can also reach 32 pixels.
    const handle = await page
      .locator('[data-choose-track="1"] .track-resizer')
      .boundingBox();
    await page.mouse.move(handle.x + 70, handle.y + 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 70, handle.y + 22);
    await page.mouse.up();
    assert.equal(await page.evaluate(() => project.trackHeights[1]), 52);
    assert.equal(await page.evaluate(() => project.trackHeights[0]), 32);
    // Independent selection and splitting do not cut the video.
    await page.evaluate((audioId) => {
      selection = new Set([audioId]);
      time = 2;
      split();
    }, audio.id);
    assert.equal(
      await page.evaluate(
        () =>
          project.clips.filter(
            (c) => c.mediaId === project.media[0].id && c.id === "video",
          ).length,
      ),
      1,
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.filter((c) => c.detachedFrom === "video").length,
      ),
      2,
    );
    await page.locator("#undoBtn").click();
    await page.locator("#fileMenu summary").first().click();
    await page.locator("#fileSave").click();
    await page.locator("#projectNameInput").fill("Audio");
    await page.locator('#projectNameDialog button[value="save"]').click();
    await page.waitForFunction(() => !saveBusy && !isProjectDirty());
    const info = await page.evaluate(() => studio.projectInfo());
    const saved = await page.evaluate(() => structuredClone(project));
    await page.evaluate(
      async (file) => applyOpened(await studio.openProject(file)),
      info.path,
    );
    assert.deepEqual(await page.evaluate(() => project.clips), saved.clips);
    assert.deepEqual(
      await page.evaluate(() => project.trackHeights),
      saved.trackHeights,
    );
    const output = path.join(dir, "detached.mp4");
    const render = await page.evaluate(() => structuredClone(project));
    await renderProject(
      render,
      output,
      { height: "original", fps: 12, quality: 55, encoder: "cpu" },
      { ffmpeg, ffprobe },
    );
    const probe = JSON.parse(
      execFileSync(
        ffprobe,
        ["-v", "quiet", "-show_streams", "-show_format", "-of", "json", output],
        { encoding: "utf8" },
      ),
    );
    const vs = probe.streams.find((s) => s.codec_type === "video"),
      as = probe.streams.find((s) => s.codec_type === "audio");
    assert.ok(Math.abs(Number(vs.duration) - Number(as.duration)) < 0.15);
    assert.ok(Number(probe.format.duration) >= 7.9);
    // Compare one-second decoded PCM before and after separation: no doubled audio.
    const originalOutput = path.join(dir, "original.mp4");
    await renderProject(
      before,
      originalOutput,
      { height: "original", fps: 12, quality: 55, encoder: "cpu" },
      { ffmpeg, ffprobe },
    );
    const rms = (file) => {
      const pcm = execFileSync(ffmpeg, [
        "-v",
        "error",
        "-ss",
        "1.25",
        "-t",
        "1",
        "-i",
        file,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-f",
        "f32le",
        "pipe:1",
      ]);
      let sum = 0;
      for (let i = 0; i + 3 < pcm.length; i += 4)
        sum += pcm.readFloatLE(i) ** 2;
      return Math.sqrt(sum / (pcm.length / 4));
    };
    const originalRms = rms(originalOutput),
      detachedRms = rms(output);
    assert.ok(Math.abs(20 * Math.log10(detachedRms / originalRms)) < 0.3);
    assert.deepEqual(await fs.readFile(input), originalBytes);
    await page.screenshot({ path: "/tmp/akhbar-detach-height.png" });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        pass: true,
        oldMin: 80,
        newMin: 32,
        reductionPercent: 60,
        independentTrimSpeed: {
          in: audio.in,
          out: audio.out,
          speed: audio.speed,
        },
        audioRmsChangeDb: 20 * Math.log10(detachedRms / originalRms),
        videoDuration: vs.duration,
        audioDuration: as.duration,
        undoRedo: true,
        reopened: true,
      }),
    );
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
