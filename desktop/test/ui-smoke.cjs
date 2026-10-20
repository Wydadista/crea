const { _electron: electron } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "crea-ui2-"));
  let app;
  try {
    const video = path.join(temp, "sample.mp4"),
      music = path.join(temp, "voice.wav"),
      output = path.join(temp, "export.mp4"),
      save = path.join(temp, "project.json"),
      recording = path.join(temp, "capture.mp4");
    const ffmpeg = require("ffmpeg-static"),
      ffprobe = require("ffprobe-static").path;
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
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
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880",
      "-t",
      "2",
      music,
    ]);
    app = await electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        ...(process.platform === "linux"
          ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
          : []),
      ],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(temp, "config"),
        XDG_CACHE_HOME: path.join(temp, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, { video, music, save, output, recording }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [video, music],
        });
        dialog.showSaveDialog = async (_w, o) => ({
          canceled: false,
          filePath: o.defaultPath.startsWith("Registrazione")
            ? recording
            : o.defaultPath.endsWith(".mp4")
              ? output
              : save,
        });
      },
      { video, music, save, output, recording },
    );
    await page.locator("#importBtn").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".media-card").length === 2,
    );
    await page.locator(".media-card").first().locator("button").click();
    await page.waitForFunction(() =>
      document.querySelector("#track0 canvas.waveform"),
    );
    // Any media on any track: audio on top, video in middle, image/text overlays later.
    await page.locator("#activeTrack").selectOption("2");
    await page.locator(".media-card").nth(1).locator("button").click();
    await page.locator("#activeTrack").selectOption("1");
    await page.locator(".media-card").first().locator("button").click();
    assert.equal(await page.locator("#track0 .clip").count(), 1);
    assert.equal(await page.locator("#track1 .clip").count(), 1);
    assert.equal(await page.locator("#track2 .clip").count(), 1);
    await page.locator("#toStart").click();
    await page.locator("#playBtn").click();
    await page.waitForTimeout(350);
    assert.ok(await page.evaluate(() => time > 0.1));
    assert.ok(
      await page.evaluate(() =>
        [...players.values()].some(
          (p) => p.kind === "video" && p.element.currentTime > 0.1,
        ),
      ),
    );
    await page.locator("#playBtn").click();
    // PiP layout and custom speed; actual independent positions survive deletion/undo.
    await page.locator("#track1 .clip").click();
    await page.locator("#clipStart").fill("1");
    await page.locator("#clipStart").press("Tab");
    await page.locator("#clipSpeed").fill("2.4");
    await page.locator("#clipSpeed").press("Tab");
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.track === 1).speed),
      2.4,
    );
    await page.locator("#layoutPanel summary").click();
    await page.locator("#layoutW").fill("50");
    await page.locator("#layoutW").press("Tab");
    await page.locator("#layoutH").fill("50");
    await page.locator("#layoutH").press("Tab");
    await page.locator("#effectsPanel summary").click();
    await page.locator("#effectType").selectOption("pixel");
    await page.locator("#effectStrength").fill("35");
    await page.locator("#effectStrength").press("Tab");
    await page.locator("#zoomFrom").fill("1");
    await page.locator("#zoomFrom").press("Tab");
    await page.locator("#zoomTo").fill("2");
    await page.locator("#zoomTo").press("Tab");
    const middle = await page.evaluate(
      () => project.clips.find((c) => c.track === 1).id,
    );
    await page.keyboard.press("Delete");
    assert.equal(
      await page.evaluate(() => project.clips.find((c) => c.track === 0).start),
      0,
    );
    await page.keyboard.press("Control+z");
    assert.equal(
      await page.evaluate(
        (id) => project.clips.find((c) => c.id === id).start,
        middle,
      ),
      1,
    );
    // Split on the ruler; keyboard focus must be on the timeline, not number inputs.
    await page.locator("#track0 .clip").click();
    let r = await page.locator("#ruler").boundingBox();
    await page.mouse.click(r.x + 80, r.y + 15);
    await page.keyboard.press("s");
    assert.equal(await page.locator("#track0 .clip").count(), 2);
    // Zoom anchors on playhead even when mouse is elsewhere.
    const before = await page.locator("#playhead").boundingBox();
    await page.mouse.move(r.x + 350, r.y + 15);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Shift");
    const after = await page.locator("#playhead").boundingBox();
    assert.ok(Math.abs(before.x - after.x) < 2, "zoom stays on green playhead");
    assert.ok(Number(await page.locator("#zoom").inputValue()) > 40);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 400);
    await page.keyboard.up("Control");
    assert.ok(
      (await page.locator("#timelineScroll").evaluate((e) => e.scrollLeft)) > 0,
    );
    await page.locator("#toStart").click();
    // Select pieces and join them into a reversible single timeline block via context menu.
    await page.locator("#track0 .clip").first().click();
    await page.keyboard.down("Control");
    await page.locator("#track0 .clip").nth(1).click();
    await page.keyboard.up("Control");
    await page.locator("#track0 .clip").first().click({ button: "right" });
    await page.locator('[data-action="group"]').click();
    assert.equal(await page.locator("#track0 .clip").count(), 1);
    assert.ok(
      await page.locator("#track0 .clip").first().getAttribute("data-group"),
    );
    const groupNode = await page.locator("#track0 .clip").boundingBox();
    await page.mouse.move(groupNode.x + 30, groupNode.y + 20);
    await page.mouse.down();
    await page.mouse.move(
      groupNode.x +
        30 +
        Number(await page.locator("#zoom").inputValue()) * 0.37,
      groupNode.y + 20,
      { steps: 5 },
    );
    await page.mouse.up();
    const starts = await page.evaluate(() =>
      project.clips
        .filter((c) => c.track === 0)
        .map((c) => c.start)
        .sort((a, b) => a - b),
    );
    assert.ok(Math.abs(starts[0] - 0.37) < 0.03);
    assert.ok(Math.abs(starts[1] - starts[0] - 2) < 0.01);
    const groupRuler = await page.locator("#ruler").boundingBox();
    await page.mouse.click(
      groupRuler.x + Number(await page.locator("#zoom").inputValue()) * 2.7,
      groupRuler.y + 15,
    );
    await page.keyboard.press("s");
    assert.equal(
      await page.locator("#track0 .clip.group").count(),
      2,
      "S splits a group into two visible blocks",
    );
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator("#track0 .clip.group").count(), 1);
    await page.locator("#toStart").click();
    await page.locator("#track0 .clip").click({ button: "right" });
    await page.locator('[data-action="ungroup"]').click();
    assert.equal(await page.locator("#track0 .clip").count(), 2);
    // Batch speed/reset (1x) affects selected pieces, without closing gaps.
    await page.locator("#clipSpeed").fill("0.5");
    await page.locator("#clipSpeed").press("Tab");
    assert.ok(
      await page.evaluate(() =>
        project.clips
          .filter((c) => c.track === 0)
          .every((c) => c.speed === 0.5),
      ),
    );
    await page.locator("#resetSpeed").click();
    assert.ok(
      await page.evaluate(() =>
        project.clips.filter((c) => c.track === 0).every((c) => c.speed === 1),
      ),
    );
    // Text with chosen font/color/background; red arrow and animated circle on any track.
    await page.locator("#activeTrack").selectOption("2");
    await page.locator("#addText").click();
    await page.locator("#annotationText").fill("Prova testo");
    await page.locator("#annotationText").press("Tab");
    await page.locator("#annotationBgEnabled").check();
    await page.locator("#annotationFont").selectOption({ index: 1 });
    await page.locator("#addArrow").click();
    await page.locator("#addCircle").click();
    assert.equal(
      await page.evaluate(
        () => project.clips.filter((c) => c.annotation).length,
      ),
      3,
    );
    await page.locator("#saveProject").click();
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.startsWith("Progetto salvato"),
    );
    const saved = JSON.parse(await fs.readFile(save));
    assert.equal(saved.version, 2);
    assert.equal(saved.clips.length, 7);
    await page.locator("#exportBtn").click();
    await page.locator("#exportHeight").selectOption("720");
    await page.locator("#exportFps").fill("12");
    await page.locator("#exportQuality").fill("65");
    await page.locator("#doExport").click();
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
    );
    assert.equal(
      meta.streams.find((s) => s.codec_type === "video").avg_frame_rate,
      "12/1",
    );
    await page.locator("#exportDialog .close").click();
    // Reopen the saved project through native IPC.
    await app.evaluate(({ dialog }, save) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [save],
      });
    }, save);
    page.once("dialog", (d) => d.accept());
    await page.locator("#openProject").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status").textContent === "Progetto aperto.",
    );
    // Synthetic display/microphone devices exercise selected deviceId and processing flags.
    await page.evaluate(() => {
      const cv = document.createElement("canvas");
      cv.width = 640;
      cv.height = 360;
      const ctx = cv.getContext("2d");
      window.fixture = setInterval(() => {
        ctx.fillStyle = `hsl(${Date.now() % 360},80%,50%)`;
        ctx.fillRect(0, 0, 640, 360);
      }, 30);
      navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(15);
      navigator.mediaDevices.enumerateDevices = async () => [
        {
          kind: "audioinput",
          deviceId: "studio-mic",
          label: "Microfono studio",
        },
      ];
      navigator.mediaDevices.getUserMedia = async (settings) => {
        window.lastMicConstraints = settings.audio;
        const ac = new AudioContext(),
          o = ac.createOscillator(),
          d = ac.createMediaStreamDestination();
        o.connect(d);
        o.start();
        window.micFixture = ac;
        return d.stream;
      };
    });
    await page.locator("#recordBtn").click();
    await page.waitForSelector("#recordDialog[open]");
    await page.locator("#microphone").check();
    await page.locator("#microphoneDevice").selectOption("studio-mic");
    await page.locator("#recordFps").fill("15");
    assert.equal(await page.locator("#recordFormat").inputValue(), "mp4");
    await page.locator("#startRecording").click();
    await page.waitForSelector("#recordingBar:visible");
    await page.waitForTimeout(1300);
    await page.locator("#stopRecording").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".media-card").length === 3,
      {},
      { timeout: 60000 },
    );
    assert.equal(
      await page.evaluate(() => window.lastMicConstraints.deviceId.exact),
      "studio-mic",
    );
    assert.equal(
      await page.evaluate(() => window.lastMicConstraints.autoGainControl),
      false,
    );
    const rec = JSON.parse(
      (
        await run(ffprobe, [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          recording,
        ])
      ).stdout,
    );
    assert.equal(
      rec.streams.find((s) => s.codec_type === "video").codec_name,
      "h264",
    );
    assert.equal(
      rec.streams.find((s) => s.codec_type === "video").avg_frame_rate,
      "15/1",
    );
    assert.ok(rec.streams.some((s) => s.codec_type === "audio"));
    assert.deepEqual(errors, []);
    await page.locator("#toStart").click();
    await page.locator("#track1 .clip").click();
    const shotRuler = await page.locator("#ruler").boundingBox();
    await page.mouse.click(
      shotRuler.x + Number(await page.locator("#zoom").inputValue()) * 1.5,
      shotRuler.y + 15,
    );
    await page.waitForTimeout(200);
    await page.evaluate(() => (document.getElementById("toast").hidden = true));
    await page.screenshot({ path: path.join(__dirname, "desktop-smoke.png") });
    console.log(
      "PASS Electron 0.2: universal layers, real waveforms, no ripple, playhead zoom, grouping, multi-select speed/reset, effects, text/arrows/circle, low-FPS MP4 export, project migration/reopen, chosen microphone, MP4 recording.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
