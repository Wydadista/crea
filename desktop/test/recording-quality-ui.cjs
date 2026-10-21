const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-quality-"));
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
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof RecordingPolicy === "object");
    await page.evaluate(async (dir) => {
      await studio.setPreferences({ recordings: dir + "/recordings" });
      window.fixtureAudio = new AudioContext({ sampleRate: 48000 });
      const osc = fixtureAudio.createOscillator(),
        gain = fixtureAudio.createGain(),
        dest = fixtureAudio.createMediaStreamDestination();
      gain.gain.value = 0.04;
      osc.connect(gain).connect(dest);
      osc.start();
      await fixtureAudio.resume();
      window.fixtureGain = gain;
      const source = document.createElement("canvas");
      source.width = 3840;
      source.height = 2160;
      const ctx = source.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, source.width, source.height);
      ctx.font = "28px Arial";
      ctx.textBaseline = "top";
      for (let i = 0; i < 62; i++) {
        ctx.fillStyle =
          i % 4 === 0
            ? "#777"
            : i % 4 === 1
              ? "#141414"
              : i % 4 === 2
                ? "#1259a0"
                : "#a52020";
        ctx.fillText(
          "Akhbar Studio — Testo piccolo 0123456789 · Pagine web e documenti · الأخبار والنصوص · abcdefghijklmnopqrstuvwxyz",
          20,
          20 + i * 34,
        );
      }
      const low = document.createElement("canvas");
      low.width = 1920;
      low.height = 1080;
      const lc = low.getContext("2d");
      lc.imageSmoothingQuality = "low";
      lc.drawImage(source, 0, 0, 1920, 1080);
      const ref = document.createElement("canvas");
      ref.width = 1920;
      ref.height = 1080;
      const rc = ref.getContext("2d");
      rc.imageSmoothingQuality = "high";
      rc.drawImage(source, 0, 0, 1920, 1080);
      window.referencePNG = ref.toDataURL("image/png");
      window.nativeFixture = source.captureStream(12);
      window.lowFixture = low.captureStream(12);
      window.fixtureTick = 0;
      window.fixtureTimer = setInterval(() => {
        ctx.fillStyle = fixtureTick++ % 2 ? "#900" : "#090";
        ctx.fillRect(3800, 2130, 20, 20);
        if (document.getElementById("recordProfile").value === "balanced")
          lc.drawImage(source, 0, 0, 1920, 1080);
      }, 1000 / 12);
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: async () =>
          document.getElementById("recordProfile").value === "balanced"
            ? lowFixture.clone()
            : nativeFixture.clone(),
      });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => dest.stream.clone(),
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        value: async () => [
          {
            kind: "audioinput",
            deviceId: "default",
            groupId: "test",
            label: "Microfono sintetico fisso",
          },
        ],
      });
      const original = RecordingPolicy.mimeCandidates;
      RecordingPolicy.mimeCandidates = (s) =>
        s.profile === "balanced"
          ? [
              "video/mp4;codecs=avc1.42001E,mp4a.40.2",
              "video/webm;codecs=h264,opus",
              "video/webm;codecs=vp8,opus",
            ]
          : original(s);
    }, dir);
    const reference = await page.evaluate(() => referencePNG);
    await fs.writeFile(
      path.join(dir, "reference.png"),
      Buffer.from(reference.split(",")[1], "base64"),
    );
    const results = [];
    for (const profile of ["balanced", "screen-text"]) {
      await page.locator("#recordBtn").click();
      await page.locator("#recordDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#captureMode").isVisible(), false);
      assert.ok(await page.locator("#captureSource").isVisible());
      await page.locator("#recordProfile").selectOption(profile);
      await page.locator("#recordHeight").selectOption("1080");
      await page.locator("#recordPreset").selectOption("100");
      await page.locator("#microphone").check();
      await page.locator("#systemAudio").uncheck({ force: true });
      await page.locator(".record-secondary").evaluate((n) => (n.open = true));
      await page.locator("#recordFps").fill("12");
      await page.locator("#recordName").fill("testo");
      await page.locator("#startRecording").click();
      await page.waitForFunction(() => recorder?.state === "recording");
      const meter = await page.evaluate(async () => {
        const samples = [],
          calls = [],
          paint = MicMeter.paint;
        MicMeter.paint = (...args) => {
          calls.push(performance.now());
          paint(...args);
        };
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 50));
          samples.push({
            db: document.getElementById("recordDb").textContent,
            transform: document.getElementById("recordLevel").style.transform,
          });
        }
        MicMeter.paint = paint;
        return {
          samples,
          calls: calls.length,
          maxGapMs: Math.max(0, ...calls.slice(1).map((t, i) => t - calls[i])),
        };
      });
      assert.ok(
        meter.samples.some((s) => s.db.includes("31") || s.db.includes("30")),
      );
      assert.ok(meter.calls >= 10);
      const toolbar = app
        .windows()
        .find((p) => p.url().includes("toolbar.html"));
      assert.ok(toolbar);
      assert.ok(/3[01]/.test(await toolbar.locator("#db").textContent()));
      await page.waitForTimeout(2000);
      const stop = Date.now();
      await page.evaluate(() => stopRecording());
      await page.waitForFunction(
        (n) => !finishing && !recorder && project.media.length > n,
        results.length,
      );
      const stopToImportMs = Date.now() - stop;
      const media = await page.evaluate(() => project.media.at(-1));
      const stat = await fs.stat(media.path);
      const probe = JSON.parse(
        execFileSync(
          require("ffprobe-static").path,
          [
            "-v",
            "quiet",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            media.path,
          ],
          { encoding: "utf8" },
        ),
      );
      const png = path.join(dir, profile + ".png");
      execFileSync(require("ffmpeg-static"), [
        "-v",
        "error",
        "-ss",
        "1",
        "-i",
        media.path,
        "-frames:v",
        "1",
        "-y",
        png,
      ]);
      const ssim = require("node:child_process").spawnSync(
        require("ffmpeg-static"),
        [
          "-hide_banner",
          "-i",
          png,
          "-i",
          path.join(dir, "reference.png"),
          "-lavfi",
          "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]ssim",
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      ).stderr;
      results.push({
        profile,
        meter,
        ssim: Number(ssim.match(/All:([.\d]+)/)?.[1]),
        path: media.path,
        bytes: stat.size,
        stopToImportMs,
        metrics: media.recordingInfo,
        video: probe.streams.find((s) => s.codec_type === "video"),
        audio: probe.streams.find((s) => s.codec_type === "audio"),
        png,
      });
      assert.equal(results.at(-1).video.width, 1920);
      assert.equal(results.at(-1).video.height, 1080);
      assert.ok(Number(results.at(-1).video.duration) > 2);
      assert.ok(
        Math.abs(
          Number(results.at(-1).video.duration) -
            Number(results.at(-1).audio.duration),
        ) < 0.2,
      );
      // The next synthetic source must have fresh tracks after the real Stop cleanup.
      if (profile === "balanced")
        await page.evaluate(() => {
          nativeFixture.getTracks().forEach(() => {});
        });
    }
    console.log(JSON.stringify({ directory: dir, results }, null, 2));
    await fs.writeFile(
      "/tmp/akhbar-quality-results.json",
      JSON.stringify({ directory: dir, results }, null, 2),
    );
    assert.deepEqual(errors, []);
  } finally {
    if (app)
      await app
        .evaluate(({ app }) => app.exit(0))
        .catch(
          () => {},
        ); /* Keep short comparison artifacts under /tmp for inspection. */
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
