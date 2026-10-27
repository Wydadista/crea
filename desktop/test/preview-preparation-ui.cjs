const { _electron } = require("playwright"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-preparation-"));
  let app;
  try {
    const video = path.join(dir, "video.mp4"),
      image = path.join(dir, "image.png"),
      audio = path.join(dir, "audio.wav");
    await run(require("ffmpeg-static"), [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=green:s=160x90:r=10",
      "-f",
      "lavfi",
      "-i",
      "anoisesrc=amplitude=.04:sample_rate=48000",
      "-t",
      "3",
      "-threads",
      "2",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      video,
    ]);
    await run(require("ffmpeg-static"), [
      "-v",
      "error",
      "-i",
      video,
      "-frames:v",
      "1",
      image,
    ]);
    await run(require("ffmpeg-static"), [
      "-v",
      "error",
      "-i",
      video,
      "-vn",
      audio,
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
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () => typeof beginPreviewPreparation === "function",
    );
    await page.evaluate(
      async (files) => {
        window.preparationEvents = [];
        new MutationObserver(() =>
          preparationEvents.push($("previewPreparationPercent").textContent),
        ).observe($("previewPreparationPercent"), { childList: true });
        thumbQueue = new Promise((r) => (window.releaseThumbs = r));
        await imported(await studio.importPaths(files));
      },
      [video, image, audio],
    );
    await page.locator("#previewPreparation").waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    assert.notEqual(
      await page.locator("#previewPreparationPercent").textContent(),
      "100%",
    );
    await page.evaluate(() => releaseThumbs());
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    assert.ok((await page.evaluate(() => preparationEvents)).includes("100%"));
    const cards = await page.evaluate(() =>
      [...$("mediaList").children].map((n) => ({
        type: n.querySelector("small")?.textContent,
        duration: n.querySelector(".media-duration").textContent,
        buttons: [...n.querySelectorAll("button")].map((b) => b.className),
        loaded: [...n.querySelectorAll("img")].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
      })),
    );
    assert.equal(cards.length, 3);
    for (const c of cards) {
      assert.equal(c.type, undefined);
      assert.match(c.duration, /^\d+:\d{2}$/);
      assert.ok(
        c.buttons.includes("add-media") && c.buttons.includes("remove-media"),
      );
      assert.ok(c.loaded);
    }
    const checkPositions = async () => {
      const positions = await page.evaluate(() =>
        [...document.querySelectorAll(".media-card")].map((card) => {
          const rect = (selector) => {
            const r = card.querySelector(selector).getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          };
          return {
            add: rect(".add-media"),
            remove: rect(".remove-media"),
            duration: rect(".media-duration"),
            poster: rect(".media-poster"),
          };
        }),
      );
      for (const p of positions) {
        assert.ok(p.add.left < p.remove.left);
        assert.ok(p.duration.top >= p.remove.bottom);
        assert.ok(Math.abs(p.duration.right - (p.poster.right - 3)) < 2);
      }
    };
    await checkPositions();
    await page.screenshot({ path: "/tmp/akhbar-library-0.4.13.png" });
    await page.locator("#mediaListView").click();
    await checkPositions();
    await page.locator("#mediaGrid").click();
    // The plus button inserts on the selected track without opening the source player.
    await page.evaluate(() => {
      Timeline.addTrack(project);
      renderTimeline();
      $("activeTrack").value = "1";
      time = 0;
    });
    await page.locator(".media-card").first().locator(".add-media").click();
    assert.equal(await page.evaluate(() => project.clips[0].track), 1);
    const snapshot = await page.evaluate(() => {
      const p = Timeline.empty();
      p.media = clone(project.media);
      const m = p.media.find((m) => m.kind === "video");
      p.clips = [
        {
          id: "one",
          mediaId: m.id,
          track: 0,
          start: 0,
          in: 0.25,
          out: 1,
          speed: 1,
          volume: 1,
        },
        {
          id: "two",
          mediaId: m.id,
          track: 0,
          start: 0.75,
          in: 1.5,
          out: 2.5,
          speed: 1,
          volume: 1,
        },
      ];
      window.preparationEvents = [];
      thumbQueue = new Promise((r) => (window.releaseThumbs = r));
      applyOpened(p);
      return JSON.stringify(project);
    });
    await page.waitForTimeout(250);
    assert.ok(await page.locator("#previewPreparation").isVisible());
    assert.notEqual(
      await page.locator("#previewPreparationPercent").textContent(),
      "100%",
    );
    await page.evaluate(() => releaseThumbs());
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => JSON.stringify(project)), snapshot);
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll(".clip-thumb,.media-thumb")].every(
          (i) => i.complete && i.naturalWidth > 0,
        ),
      ),
    );
    await page.evaluate(() => {
      selection = new Set(["one"]);
      previewFocus = "one";
      properties();
      window.noiseEvents = [];
      studio.onAudioPreparationProgress((s) => noiseEvents.push(s));
    });
    await page.locator("#addDenoise").evaluate((n) => n.click());
    await page.locator("#previewPreparation").waitFor({ state: "visible" });
    assert.match(
      await page.locator("#previewPreparationTitle").textContent(),
      /DeepFilterNet3/,
    );
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    assert.ok(
      await page.evaluate(
        () =>
          noiseEvents.some((s) => s.percent === 20) &&
          noiseEvents.some((s) => s.percent === 100),
      ),
    );
    assert.equal(await page.evaluate(() => project.clips[0].voice.noise), 0.5);
    await page.evaluate(() => {
      $("voiceNoise").value = "70";
      $("voiceNoise").dispatchEvent(new Event("change"));
    });
    await page.locator("#previewPreparation").waitFor({ state: "visible" });
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => project.clips[0].voice.noise), 0.7);
    // A missing thumbnail gives a fallback and releases the loading screen.
    await page.evaluate((dir) => {
      const p = Timeline.empty();
      p.media = [
        {
          id: "bad",
          path: dir + "/missing.png",
          url: "file://" + dir + "/missing.png",
          name: "Missing",
          kind: "image",
          duration: 5,
          hasAudio: false,
        },
      ];
      applyOpened(p);
    }, dir);
    await page.locator("#previewPreparation").waitFor({ state: "hidden" });
    assert.ok(await page.locator(".media-poster.unavailable").isVisible());
    assert.deepEqual(errors, []);
    console.log(
      "PASS: progress waits for thumbnails/waveforms/first preview, 100% then closes; compact media cards and plus; real DeepFilterNet3 gallery/property progress; failed thumbnail fallback",
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
