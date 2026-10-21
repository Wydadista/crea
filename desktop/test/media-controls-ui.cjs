const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
(async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "akhbar-media-controls-"),
  );
  let app;
  try {
    const files = [];
    for (const size of ["1920x1080", "1080x1920", "1080x1080"]) {
      const file = path.join(dir, size + ".mp4");
      execFileSync(require("ffmpeg-static"), [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=${size}:rate=2`,
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        file,
      ]);
      files.push(file);
    }
    app = await electron.launch({
      args: [path.resolve(__dirname, ".."), "--no-sandbox", "--disable-gpu"],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(() => typeof fitSourcePreview === "function");
    assert.equal(await page.locator("#mediaColumns").textContent(), "3");
    assert.equal(
      await page.locator("#mediaGrid").getAttribute("aria-pressed"),
      "true",
    );
    for (let i = 0; i < 2; i++)
      await page.locator("#mediaColumnsMinus").click();
    assert.equal(await page.locator("#mediaColumns").textContent(), "1");
    assert.ok(await page.locator("#mediaColumnsMinus").isDisabled());
    for (let i = 0; i < 5; i++) await page.locator("#mediaColumnsPlus").click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("akhbar-media-columns")),
      "6",
    );
    await page.locator("#mediaListView").click();
    assert.equal(
      await page
        .locator("#mediaList")
        .evaluate((n) => n.classList.contains("grid")),
      false,
    );
    await page.locator("#mediaGrid").click();
    const toolbar = await page.locator(".media-toolbar").evaluate((n) => {
      const controls = [...n.children].map((c) => c.getBoundingClientRect());
      return {
        top: controls.map((r) => r.y),
        right: Math.max(...controls.map((r) => r.right)),
        limit: n.getBoundingClientRect().right,
      };
    });
    assert.equal(new Set(toolbar.top).size, 1);
    assert.ok(toolbar.right <= toolbar.limit + 1);
    await app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: files,
      });
    }, files);
    await page.locator("#importBtn").click();
    await page.waitForFunction(() => project.media.length === 3);
    const dropped = path.join(dir, "dropped.mp4");
    await fs.copyFile(files[0], dropped);
    const cdp = await page.context().newCDPSession(page),
      button = await page.locator("#importBtn").boundingBox();
    const drag = {
      x: button.x + button.width / 2,
      y: button.y + button.height / 2,
      data: { items: [], files: [dropped], dragOperationsMask: 1 },
    };
    await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", ...drag });
    await cdp.send("Input.dispatchDragEvent", { type: "dragOver", ...drag });
    await cdp.send("Input.dispatchDragEvent", { type: "drop", ...drag });
    await page.waitForFunction(() => project.media.length === 4);
    await cdp.detach();
    for (let i = 0; i < files.length; i++) {
      await page.evaluate((i) => showSource(project.media[i]), i);
      await page.waitForFunction(
        () => document.querySelector("#sourcePlayer video")?.videoWidth > 0,
      );
      for (const width of [680, 300]) {
        await page
          .locator("#sourceDialog")
          .evaluate((n, w) => (n.style.width = w + "px"), width);
        await page.waitForFunction(() => {
          const p = document.querySelector("#sourcePlayer video"),
            b = document.getElementById("sourcePlayer");
          const ratio = Math.min(
            0.3,
            b.clientWidth / p.videoWidth,
            b.clientHeight / p.videoHeight,
          );
          return (
            Math.abs(p.getBoundingClientRect().width - p.videoWidth * ratio) <
              1 &&
            Math.abs(p.getBoundingClientRect().height - p.videoHeight * ratio) <
              1
          );
        });
        const box = await page.evaluate(() => {
          const p = document.querySelector("#sourcePlayer video"),
            b = document.getElementById("sourcePlayer"),
            pr = p.getBoundingClientRect(),
            br = b.getBoundingClientRect();
          return {
            w: pr.width,
            h: pr.height,
            nw: p.videoWidth,
            nh: p.videoHeight,
            bw: br.width,
            bh: br.height,
            dx: Math.abs(pr.x + pr.width / 2 - br.x - br.width / 2),
            dy: Math.abs(pr.y + pr.height / 2 - br.y - br.height / 2),
            fit: getComputedStyle(p).objectFit,
          };
        });
        assert.equal(box.fit, "contain");
        assert.ok(box.w <= box.bw && box.h <= box.bh);
        assert.ok(Math.abs(box.w / box.h - box.nw / box.nh) < 0.01);
        assert.ok(box.dx < 2 && box.dy < 2);
        assert.ok(box.w <= box.nw * 0.3 + 1);
      }
      await page.locator("#sourceDialog button").click();
    }
    await page.evaluate(() => addMedia(project.media[0].id, 0, 0));
    assert.ok(await page.locator("#clipSpeed").isVisible());
    assert.equal(await page.locator("#clipSpeed").inputValue(), "1");
    await page.locator("#clipSpeed").fill("0,5");
    await page.locator("#clipSpeed").dispatchEvent("change");
    assert.equal(await page.evaluate(() => project.clips[0].speed), 0.5);
    await page.evaluate(() => {
      selectIds([project.clips[0].id]);
      showContext(400, 300);
    });
    assert.equal(
      await page.locator("#contextSpeedValue").textContent(),
      "0,5×",
    );
    await page.locator('[data-action="set-speed"]').click();
    assert.equal(await page.locator("#speedDialogValue").inputValue(), "0.5");
    await page.locator("#speedDialogValue").fill("2");
    await page.locator('#speedForm button[value="apply"]').click();
    assert.equal(await page.evaluate(() => first().speed), 2);
    assert.equal(await page.locator("#clipSpeed").inputValue(), "2");
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => project.clips[0].speed), 0.5);
    await page.evaluate(() => {
      selectIds([project.clips[0].id]);
      showContext(400, 300);
    });
    await page.locator('[data-action="speed"]').click();
    assert.equal(await page.evaluate(() => first().speed), 1);
    const speed = await page.evaluate(
      () => JSON.parse(JSON.stringify(project)).clips[0].speed,
    );
    assert.equal(speed, 1);
    const original = await page.evaluate(() => JSON.stringify(project));
    await page.locator('[data-choose-track="0"]').click({ button: "right" });
    await page.locator("#deleteTrack").click();
    await page.locator('#deleteTrackForm button[value="cancel"]').click();
    assert.equal(await page.evaluate(() => JSON.stringify(project)), original);
    await page.locator('[data-choose-track="0"]').click({ button: "right" });
    await page.locator("#deleteTrack").click();
    await page.locator('#deleteTrackForm button[value="delete"]').click();
    assert.equal(await page.evaluate(() => project.clips.length), 0);
    await page.locator("#undoBtn").click();
    assert.equal(await page.evaluate(() => JSON.stringify(project)), original);
    await page.locator("#compactTimeline").click();
    assert.equal(await page.evaluate(() => panelLayout.timeline), 180);
    await page.locator("#compactTimeline").click();
    assert.equal(await page.evaluate(() => panelLayout.timeline), 220);
    await page.evaluate(() => {
      Timeline.addTrack(project);
      changed();
    });
    await page
      .locator("#track1")
      .click({ button: "right", position: { x: 10, y: 60 } });
    await page.locator("#deleteTrack").click();
    assert.equal(await page.evaluate(() => project.trackCount), 1);
    await page.screenshot({ path: "/tmp/akhbar-media-controls.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: track deletion/cancel/undo, compact timeline, visible shared speed controls, context/reset/undo, compact toolbar, persistent 1–6 columns, whole landscape/portrait/square source frames at 30% with responsive fit.",
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
