/* Real Electron integration. On Linux run inside an X display, e.g. xvfb-run -a npm run test:ui. */
const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "crea-ui-"));
  let app;
  try {
    const video = path.join(temp, "sample.mp4"),
      music = path.join(temp, "music.wav"),
      output = path.join(temp, "export.mp4"),
      save = path.join(temp, "project.json"),
      recording = path.join(temp, "capture.webm");
    const ffmpeg = require("ffmpeg-static"),
      ffprobe = require("ffprobe-static").path;
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=320x180:r=30",
      "-t",
      "4",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      video,
    ]);
    await run(ffmpeg, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
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
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await app.evaluate(
      ({ dialog }, { video, music, save, output, recording }) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [video, music],
        });
        dialog.showSaveDialog = async (_win, options) => ({
          canceled: false,
          filePath: options.defaultPath.endsWith(".webm")
            ? recording
            : options.defaultPath.endsWith(".mp4")
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
    await page.locator(".media-card").nth(0).locator("button").click();
    await page.locator(".media-card").nth(1).locator("button").click();
    await page.locator("#visualTrack .clip").click();
    const ruler = await page.locator("#ruler").boundingBox();
    await page.mouse.click(ruler.x + 80, ruler.y + 15);
    await page.keyboard.press("s");
    assert.equal(await page.locator("#visualTrack .clip").count(), 2);
    await page.keyboard.press("Control+z");
    assert.equal(await page.locator("#visualTrack .clip").count(), 1);
    await page.keyboard.press("Control+Shift+z");
    assert.equal(await page.locator("#visualTrack .clip").count(), 2);
    // Real HTML drag/drop: reorder the split clips and append another copy from the library.
    const firstId = await page
      .locator("#visualTrack .clip")
      .first()
      .getAttribute("data-id");
    await page
      .locator("#visualTrack .clip")
      .first()
      .dragTo(page.locator("#visualTrack"), {
        targetPosition: { x: 230, y: 40 },
      });
    assert.equal(
      await page.locator("#visualTrack .clip").last().getAttribute("data-id"),
      firstId,
    );
    await page
      .locator(".media-card")
      .first()
      .dragTo(page.locator("#visualTrack"), {
        targetPosition: { x: 350, y: 40 },
      });
    assert.equal(await page.locator("#visualTrack .clip").count(), 3);
    await page.locator("#visualTrack .clip").last().click();
    await page.keyboard.press("Delete");
    assert.equal(await page.locator("#visualTrack .clip").count(), 2);
    await page.mouse.move(ruler.x + 100, ruler.y + 15);
    await page.keyboard.down("Shift");
    await page.mouse.wheel(0, -400);
    await page.keyboard.up("Shift");
    assert.ok(Number(await page.locator("#zoom").inputValue()) > 40);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 500);
    await page.keyboard.up("Control");
    assert.ok(
      (await page.locator("#timelineScroll").evaluate((el) => el.scrollLeft)) >
        0,
    );
    await page.locator("#toStart").click();
    await page.locator("#playBtn").click();
    await page.waitForTimeout(450);
    await page.locator("#playBtn").click();
    assert.notEqual(
      (await page.locator("#timecode").innerText()).slice(0, 8),
      "00:00.00",
    );
    await page.locator("#keysBtn").click();
    await page.locator("#keySplit").focus();
    await page.keyboard.press("x");
    assert.equal(await page.locator("#keySplit").inputValue(), "X");
    await page.locator("#resetKeys").click();
    await page.locator("#keysDialog .close").click();
    await page.locator("#saveProject").click();
    await page.waitForFunction(() =>
      document
        .getElementById("status")
        .textContent.includes("Progetto salvato"),
    );
    const saved = JSON.parse(await fs.readFile(save, "utf8"));
    assert.equal(saved.clips.length, 2);
    assert.equal(saved.music.length, 1);
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
    assert.equal(await page.locator("#visualTrack .clip").count(), 2);
    await page.locator("#exportBtn").click();
    await page.locator("#exportHeight").selectOption("720");
    await page.locator("#doExport").click();
    await page.waitForFunction(
      () =>
        document
          .getElementById("exportStatus")
          .textContent.startsWith("Salvato in"),
      {},
      { timeout: 60000 },
    );
    const probe = JSON.parse(
      (
        await run(ffprobe, [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          output,
        ])
      ).stdout,
    );
    assert.ok(probe.streams.some((s) => s.codec_name === "h264"));
    assert.ok(Math.abs(Number(probe.format.duration) - 4) < 0.2);
    await page.locator("#exportDialog .close").click();
    // Exercise the full recorder/storage/remux pipeline with generated screen frames.
    // OS desktop/audio capture still needs a real Windows test.
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      window.recordFixture = setInterval(() => {
        ctx.fillStyle = `hsl(${Date.now() % 360},70%,50%)`;
        ctx.fillRect(0, 0, 640, 360);
      }, 30);
      navigator.mediaDevices.getDisplayMedia = async () =>
        canvas.captureStream(30);
    });
    await page.locator("#recordBtn").click();
    await page.waitForSelector("#recordDialog[open]");
    if (await page.locator("#systemAudio").isEnabled())
      await page.locator("#systemAudio").uncheck();
    await page.locator("#startRecording").click();
    await page.waitForSelector("#recordingBar:visible");
    await page.waitForTimeout(1400);
    await page.locator("#stopRecording").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".media-card").length === 3,
      {},
      { timeout: 30000 },
    );
    const rec = JSON.parse(
      (
        await run(ffprobe, [
          "-v",
          "error",
          "-show_format",
          "-of",
          "json",
          recording,
        ])
      ).stdout,
    );
    assert.ok(Number(rec.format.duration) > 1);
    assert.deepEqual(errors, []);
    await page.locator("#toStart").click();
    await page.locator("#visualTrack .clip").first().click();
    await page.evaluate(() => (document.getElementById("toast").hidden = true));
    await page.screenshot({
      path: path.join(
        path.resolve(__dirname, ".."),
        "test",
        "desktop-smoke.png",
      ),
    });
    console.log(
      "PASS Electron: import, source probing, drag/drop, S split, undo/redo, delete, Ctrl/Shift wheel, playback, custom keys, save, real MP4 export, synthetic screen recording + WebM remux.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
