const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-ui-"));
  let app;
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(dir, "config"),
    XDG_CACHE_HOME: path.join(dir, "cache"),
  };
  const launch = () =>
    electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      env,
    });
  try {
    const video = path.join(dir, "source.mp4"),
      save = path.join(dir, "Prova.creastudio"),
      output = path.join(dir, "export.mp4");
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=12",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "12",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-c:a",
      "aac",
      video,
    ]);
    app = await launch();
    let page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, { video, save, output }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [video],
        });
        dialog.showSaveDialog = async (_w, o) => ({
          canceled: false,
          filePath: o.defaultPath.endsWith(".mp4") ? output : save,
        });
      },
      { video, save, output },
    );
    await page.evaluate(
      async (dir) => studio.setPreferences({ projects: dir, exports: dir }),
      path.join(dir, "projects"),
    );
    assert.equal(await page.title(), "AKhbar studio");
    assert.ok(await page.locator("#addText").isHidden());
    await page.locator("#railElements").click();
    assert.ok(await page.locator("#importBtn").isHidden());
    assert.ok(await page.locator("#addText").isVisible());
    await page.locator("#railMedia").click();
    await page.locator("#importBtn").click();
    await page.waitForFunction(() => project.media.length === 1);
    await page.locator("#mediaView").selectOption("grid");
    await page.waitForFunction(
      () => document.querySelector(".media-thumb")?.naturalWidth > 0,
    );
    await page.locator(".media-card strong").click();
    assert.ok(await page.locator("#sourcePlayer video").isVisible());
    assert.equal(await page.evaluate(() => project.clips.length), 0);
    await page.locator("#sourceDialog button").click();
    await page.locator(".media-card button").click();
    assert.equal(await page.evaluate(() => project.clips[0].mono), true);
    console.log("stage: source preview");
    // Freeze creates a separate still, with undo/redo, without changing audio/source clips.
    const original = await page.evaluate(() =>
      JSON.stringify(project.clips[0]),
    );
    await page.evaluate(() => {
      seek(4);
      selectIds([project.clips[0].id]);
    });
    await page.locator("#freezeFrame").click();
    await page.waitForFunction(() => project.clips.length === 2);
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips[0])),
      original,
    );
    assert.equal(await page.evaluate(() => mediaOf(first()).kind), "image");
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => project.clips.length), 1);
    await page.locator("#redoBtn").click();
    assert.equal(await page.evaluate(() => project.clips.length), 2);
    console.log("stage: freeze");
    // First-frame thumbnail is keyed by source trim, not timeline position.
    await page.evaluate(() => {
      selectIds([project.clips[0].id]);
      seek(7);
      split();
    });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".clip-thumb")].filter(
          (i) => i.naturalWidth > 0,
        ).length === 3,
    );
    const thumbs = await page
      .locator("#track0 .clip-thumb")
      .evaluateAll((els) => els.map((i) => i.src));
    assert.notEqual(thumbs[0], thumbs[1]);
    await page.locator("#rippleFamily").click();
    await page.evaluate(() => {
      selectIds([project.clips.find((c) => c.track === 0 && c.in === 0).id]);
    });
    await page.locator("#deleteTool").click();
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.track === 0).start),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => mediaOf(c).kind === "image").start,
      ),
      4,
    );
    await page.locator("#undoBtn").click();
    await page.evaluate(() => {
      project.clips[0].out = 3600;
      project.media[0].duration = 3600;
      project.clips = project.clips.slice(0, 1);
      render();
    });
    await page.locator("#fitTimeline").click();
    assert.ok(await page.evaluate(() => scale < 1));
    await page.locator("#projectSeek").fill("3599");
    await page.locator("#projectSeek").dispatchEvent("input");
    assert.equal(await page.evaluate(() => time), 3599);
    await page.evaluate(() => {
      project.media[0].duration = 12;
      project.clips[0].out = 12;
      seek(0);
      render();
    });
    await page.locator("#saveProject").click();
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Progetto salvato"),
    );
    const bundle = path.join(dir, "Prova", "Prova.creastudio"),
      saved = JSON.parse(await fs.readFile(bundle, "utf8"));
    assert.ok(saved.media.every((m) => !m.path || !path.isAbsolute(m.path)));
    for (const m of saved.media)
      if (m.path) await fs.access(path.resolve(path.dirname(bundle), m.path));
    await page.locator("#exportBtn").click();
    await page.locator("#chooseExportPath").click();
    assert.equal(await page.locator("#exportPath").textContent(), output);
    await page.locator("#exportHeight").selectOption("original");
    await page.locator("#exportFps").fill("12");
    await page.locator("#exportQuality").fill("65");
    await page.locator("#doExport").click();
    await page.waitForFunction(
      () => document.getElementById("exportProgress").value === 100,
      {},
      { timeout: 120000 },
    );
    await page.locator("#exportDialog .close").click();
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
    );
    assert.equal(meta.streams[0].avg_frame_rate, "12/1");
    assert.equal(meta.streams[0].width, 320);
    console.log("stage: export");
    // Real MediaRecorder with synthetic screen/microphone; verify floating controls.
    const fakeDevices = async (page) =>
      page.evaluate(() => {
        const cv = document.createElement("canvas");
        cv.width = 320;
        cv.height = 180;
        let frame = 0;
        const ctx = cv.getContext("2d");
        window.captureFixture = setInterval(() => {
          ctx.fillStyle = `hsl(${frame++ % 360},80%,50%)`;
          ctx.fillRect(0, 0, 320, 180);
        }, 80);
        navigator.mediaDevices.getDisplayMedia = async () =>
          cv.captureStream(12);
        navigator.mediaDevices.enumerateDevices = async () => [
          {
            kind: "audioinput",
            deviceId: "stable-mic",
            groupId: "stable-group",
            label: "Microfono studio",
          },
        ];
        navigator.mediaDevices.getUserMedia = async () => {
          const ac = new AudioContext(),
            o = ac.createOscillator(),
            d = ac.createMediaStreamDestination();
          o.connect(d);
          o.start();
          window.syntheticMic = ac;
          await ac.resume();
          return d.stream;
        };
      });
    await fakeDevices(page);
    await page.locator("#recordBtn").click();
    await page.waitForSelector("#recordDialog[open]");
    await page.locator("#recordName").fill("ottobre");
    await page.locator("#recordName").dispatchEvent("change");
    await page.locator("#microphone").check();
    await page.locator("#microphoneDevice").selectOption("stable-mic");
    await page.locator("#recordHeight").selectOption("720");
    await page.locator("#recordFps").fill("12");
    await page.locator("#recordQuality").fill("65");
    await page.locator("#recordQuality").dispatchEvent("change");
    await page.locator("#startRecording").click();
    await page.waitForFunction(() => recorder?.state === "recording");
    console.log("stage: capturing");
    await page.waitForTimeout(1200);
    await page.waitForFunction(
      () => document.getElementById("recordLevel").value > 0,
    );
    let toolbar;
    for (let i = 0; i < 30; i++) {
      toolbar = app.windows().find((w) => w !== page);
      if (toolbar) break;
      await page.waitForTimeout(100);
    }
    console.log("stage: mic meter");
    assert.ok(toolbar);
    assert.ok(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.isAlwaysOnTop()),
      ),
    );
    console.log("stage: pause command");
    await toolbar.locator("#pause").click();
    await page.waitForFunction(() => recorder?.state === "paused");
    const paused = await page.evaluate(() => elapsedRecording());
    await page.waitForTimeout(600);
    assert.ok(
      Math.abs((await page.evaluate(() => elapsedRecording())) - paused) < 0.1,
    );
    await toolbar.locator("#pause").click();
    await page.waitForFunction(() => recorder?.state === "recording");
    await page.waitForTimeout(500);
    await toolbar.locator("#stop").click();
    await page.waitForFunction(
      () => !finishing && project.media.some((m) => m.name === "ottobre-1.mp4"),
      {},
      { timeout: 60000 },
    );
    const recordingPath = await page.evaluate(
      () => project.media.find((m) => m.name === "ottobre-1.mp4").path,
    );
    await fs.access(recordingPath);
    // Restart application with same user data: settings/view and stable device survive.
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await fakeDevices(page);
    assert.equal(await page.locator("#mediaView").inputValue(), "grid");
    await page.locator("#recordBtn").click();
    await page.waitForSelector("#recordDialog[open]");
    assert.equal(await page.locator("#recordName").inputValue(), "ottobre");
    assert.equal(
      await page.locator("#microphoneDevice").inputValue(),
      "stable-mic",
    );
    assert.equal(await page.locator("#recordQuality").inputValue(), "65");
    await page.locator("#startRecording").click();
    await page.waitForFunction(() => recorder?.state === "recording");
    await page.waitForTimeout(1200);
    await page.locator("#stopRecording").click();
    // The durable counter continues even when recording into a different project folder.
    await page.waitForFunction(
      () => !finishing && project.media.some((m) => m.name === "ottobre-2.mp4"),
      {},
      { timeout: 60000 },
    );
    // Record a replacement phrase, preserving the selected original and all timing.
    await page.evaluate(() => {
      addMedia(project.media[0].id, 0, 0);
      selectIds([project.clips[0].id]);
    });
    const originalAudio = await page.evaluate(() =>
      JSON.stringify(project.clips),
    );
    await page.locator("#rangeStart").fill("0.2");
    await page.locator("#rangeEnd").fill("0.6");
    await page.locator("#replaceAudio").check();
    await page.locator("#recordPhrase").click();
    await page.waitForSelector("#recordDialog[open]");
    await page.locator("#startRecording").click();
    await page.waitForFunction(() => recorder?.state === "recording");
    await page.waitForTimeout(1100);
    await page.locator("#stopRecording").click();
    await page.waitForFunction(
      () =>
        !finishing && project.clips.some((c) => mediaOf(c).kind === "audio"),
      {},
      { timeout: 60000 },
    );
    assert.equal(
      await page.evaluate(
        () => project.clips.find((c) => mediaOf(c).kind === "audio").start,
      ),
      0.2,
    );
    assert.equal(
      await page.evaluate(() => project.clips.filter((c) => c.muted).length),
      1,
    );
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.muted).start),
      0.2,
    );
    await page.locator("#undoBtn").click();
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips)),
      originalAudio,
    );
    await page.locator("#redoBtn").click();
    assert.equal(
      await page.evaluate(() => project.clips.filter((c) => c.muted).length),
      1,
    );
    await page.locator("#noiseModerate").click();
    assert.equal(await page.evaluate(() => first().voice.noise), 0.25);
    await page.locator("#noiseCompare").click();
    assert.equal(await page.evaluate(() => first().voice.bypass), true);
    const phraseSave = path.join(dir, "Frase.creastudio"),
      phraseBundle = path.join(dir, "Frase", "Frase.creastudio");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, phraseSave);
    await page.locator("#saveProject").click();
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Progetto salvato"),
    );
    const structured = await page.evaluate(() => JSON.stringify(project.clips));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, phraseBundle);
    page.once("dialog", (d) => d.accept());
    await page.locator("#openProject").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent === "Progetto aperto.",
    );
    assert.equal(
      await page.evaluate(() => JSON.stringify(project.clips)),
      structured,
    );
    console.log(
      "PASS replacement phrase: countdown, real audio-only MediaRecorder, dedicated aligned track, partial mute, undo/redo, denoise comparison, portable reopen.",
    );
    await page.evaluate(() => {
      recordingPrefs.microphoneDevice = "missing-device";
      recordingPrefs.microphoneLabel = "Scollegato";
      recordingPrefs.microphoneGroup = "missing-group";
    });
    await page.locator("#recordBtn").click();
    await page.waitForSelector("#recordDialog[open]");
    assert.equal(
      await page.locator("#microphoneDevice").inputValue(),
      "missing",
    );
    await page.locator("#startRecording").click();
    assert.equal(await page.evaluate(() => recorder), null);
    assert.match(
      await page.locator("#deviceWarning").textContent(),
      /non è disponibile/,
    );
    await page.locator("#recordDialog .close").click();
    assert.deepEqual(errors, []);
    console.log(
      "PASS AKhbar UI: panels, source preview, grid persistence, thumbnails after trim, freeze undo/redo, family ripple, hour fit/seek, portable save, native destination picker/export, MediaRecorder MP4, floating toolbar, pause duration, microphone meter, app restart/preferences, missing-device guard.",
    );
  } catch (e) {
    console.error("TEST FAILURE", e);
    throw e;
  } finally {
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
