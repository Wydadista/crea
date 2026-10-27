const { _electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-toolbar-"));
  let app;
  try {
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
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof recorderReady === "function");
    await page.evaluate(
      async (dir) => studio.setPreferences({ recordings: dir + "/recordings" }),
      dir,
    );
    await page.evaluate(async () => {
      window.fixtureAudio = new AudioContext();
      const osc = fixtureAudio.createOscillator(),
        dest = fixtureAudio.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      await fixtureAudio.resume();
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "green";
      ctx.fillRect(0, 0, 320, 180);
      window.fixtureVideo = canvas.captureStream(10);
      window.fixtureInterval = setInterval(
        () => ctx.fillRect(0, 0, 320, 180),
        100,
      );
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: async () => fixtureVideo.clone(),
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
            label: "Test microphone",
          },
        ],
      });
      await showRecording();
      $("recordFormat").value = "webm";
      $("recordFps").value = "10";
      $("recordHeight").value = "720";
      $("microphone").checked = true;
    });
    const toolbar = app.windows().find((w) => w.url().includes("toolbar.html"));
    assert.ok(toolbar);
    toolbar.setDefaultTimeout(12000);
    const checkIdle = async () => {
      for (const id of ["state", "pause", "stop", "discard"])
        assert.equal(await toolbar.locator("#" + id).isVisible(), false);
      for (const id of ["name", "start", "settings", "minimize", "close"])
        assert.ok(await toolbar.locator("#" + id).isVisible());
      assert.ok(await toolbar.locator(".meter").isVisible());
      assert.ok(
        await toolbar.evaluate(() => document.body.scrollWidth <= innerWidth),
      );
    };
    await checkIdle();
    await toolbar.locator("#name").fill("Registrazione prova");
    await toolbar.locator("#start").click();
    await page.waitForFunction(() => recorder?.state === "recording");
    await toolbar.waitForFunction(() =>
      document.body.classList.contains("compact"),
    );
    await toolbar.screenshot({ path: "/tmp/akhbar-toolbar-0.4.11.png" });
    const native = () =>
      app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes("toolbar.html"),
        );
        return {
          bounds: w.getBounds(),
          top: w.isAlwaysOnTop(),
          minimized: w.isMinimized(),
        };
      });
    assert.equal((await native()).bounds.width, 480);
    assert.equal(await toolbar.locator("#name").isVisible(), false);
    assert.equal(await toolbar.locator("#settings").isVisible(), false);
    assert.equal(
      await toolbar.locator("#discard").getAttribute("title"),
      "Scarta e ricomincia",
    );
    assert.ok(
      await toolbar.evaluate(() => document.body.scrollWidth <= innerWidth),
    );
    for (let i = 0; i < 3; i++) {
      await toolbar.locator("#pause").click();
      await page.waitForFunction(() => recorder?.state === "paused");
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("index.html"))
          .focus(),
      );
      await page.waitForTimeout(180);
      assert.ok((await native()).top);
      await toolbar.locator("#pause").click();
      await page.waitForFunction(() => recorder?.state === "recording");
    }
    await toolbar.locator("#minimize").click();
    await page.waitForTimeout(300);
    assert.ok((await native()).minimized);
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("toolbar.html"))
        .restore(),
    );
    await toolbar.locator("#discard").click();
    await page
      .waitForFunction(() => recordingCountdown)
      .catch(async (e) => {
        console.log(
          await page.evaluate(() => ({
            state: recorder?.state,
            finishing,
            recorderOpen,
            recordingCountdown,
            recorderStarting,
            restartRecorderAfter,
            discardCurrent,
            disabled: $("startRecording").disabled,
            status: $("status").textContent,
          })),
        );
        throw e;
      });
    await page.waitForFunction(
      () => recorder?.state === "recording" && !recordingCountdown,
    );
    assert.equal(await page.evaluate(() => project.media.length), 0);
    assert.ok((await native()).top);
    await page.waitForTimeout(500);
    await toolbar.locator("#stop").click();
    await page.waitForFunction(
      () => !recorder && !finishing && project.media.length === 1,
    );
    await toolbar.waitForFunction(
      () => !document.body.classList.contains("compact"),
    );
    assert.equal((await native()).bounds.width, 720);
    await checkIdle();
    assert.equal((await native()).top, false);
    assert.ok(await toolbar.locator("#name").isVisible());
    assert.equal(
      await toolbar.locator("#name").inputValue(),
      "Registrazione prova",
    );
    // Use the real imported video to inspect normal, joined and compact-group borders.
    const styles = await page.evaluate(() => {
      stopIdleMonitor();
      recorderOpen = false;
      const m = project.media[0];
      project = Timeline.empty();
      project.media = [m];
      project.clips = [0, 1, 2, 3, 4].map((i) => ({
        id: "b" + i,
        mediaId: m.id,
        in: 0,
        out: 0.2,
        start: i * 0.2,
        track: 0,
        speed: 1,
        volume: 1,
      }));
      project.clips[1].groupId = project.clips[2].groupId = "joined";
      project.clips[3].linkId = project.clips[4].linkId = "linked";
      selection.clear();
      render();
      const read = () =>
        [...document.querySelectorAll(".clip")].map((n) => {
          const s = getComputedStyle(n);
          return {
            id: n.dataset.id,
            top: s.borderTopWidth,
            left: s.borderLeftWidth,
            right: s.borderRightWidth,
            color: s.borderTopColor,
            shadow: s.boxShadow,
            outline: s.outlineStyle,
          };
        });
      const unselected = read();
      selection = new Set(project.clips.map((c) => c.id));
      renderTimeline();
      return { unselected, selected: read() };
    });
    for (const s of styles.unselected) {
      assert.equal(s.top, "1px");
      assert.equal(s.color, "rgb(105, 113, 123)");
    }
    for (const s of styles.selected) {
      assert.equal(s.top, "2px");
      assert.equal(s.color, "rgb(255, 200, 46)");
      assert.equal(s.shadow, "none");
    }
    assert.equal(styles.selected.find((s) => s.id === "b1").right, "0px");
    assert.equal(styles.selected.find((s) => s.id === "b2").left, "0px");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: recording, pause/resume, topmost, minimize/restore, discard/restart, stop/import, persistent window and clip borders",
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
