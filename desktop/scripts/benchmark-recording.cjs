// Real-time synthetic MediaRecorder capture, followed by isolated Stop-stage timings.
// Requires an X display. Does NOT validate Windows capture drivers or a real microphone.
const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const run = require("node:util").promisify(
  require("node:child_process").execFile,
);
const ffmpeg = require("ffmpeg-static"),
  ffprobe = require("ffprobe-static").path;
const { Recording } = require("../src/recording"),
  { waveform } = require("../src/waveform");
(async () => {
  const out = path.resolve(process.argv[2] || "/tmp/akhbar-recording-serial");
  await fs.mkdir(out, { recursive: true });
  let app;
  const handles = new Map(),
    recordings = new Map(),
    queues = new Map(),
    results = [];
  const durations = (process.env.BENCH_RECORD_SECONDS || "60,300,360")
    .split(",")
    .map(Number);
  try {
    app = await electron.launch({
      args: [
        path.resolve(__dirname, ".."),
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(out, "config"),
        XDG_CACHE_HOME: path.join(out, "cache"),
      },
    });
    const page = await app.firstWindow();
    await page.exposeFunction("benchWrite", async (id, bytes) => {
      const previous = queues.get(id) || Promise.resolve();
      const job = previous.then(async () => {
        let at = 0;
        const data = Buffer.from(bytes);
        if (recordings.has(id)) {
          await recordings.get(id).append(data);
          return;
        }
        const handle = handles.get(id);
        while (at < data.length)
          at += (await handle.write(data, at)).bytesWritten;
      });
      queues.set(id, job);
      await job;
    });
    const captureMime = await page.evaluate(() =>
      [
        "video/mp4;codecs=avc1.42001E,mp4a.40.2",
        "video/mp4;codecs=avc1.42001E",
        "video/webm;codecs=h264,opus",
        "video/webm;codecs=vp8,opus",
      ].find((m) => MediaRecorder.isTypeSupported(m)),
    );
    if (!captureMime) throw Error("No supported capture codec");
    const descriptors = [];
    for (const duration of durations)
      for (const mode of ["before", "after"]) {
        const id = `${mode}-${duration}`,
          file = path.join(out, id + (mode === "before" ? ".webm" : ".mp4"));
        if (mode === "before") handles.set(id, await fs.open(file, "w"));
        else {
          const temp = await fs.mkdtemp(path.join(out, "live-"));
          recordings.set(
            id,
            await new Recording(
              ffmpeg,
              temp,
              path.join(out, id + "-ready.mp4"),
              {
                height: 720,
                fps: 12,
                quality: 65,
                format: "mp4",
                mime: captureMime,
                audioBitrate: 192,
                captureDuration: duration,
              },
            ).begin(),
          );
        }
        descriptors.push({
          id,
          mode,
          duration,
          file,
          mime: mode === "before" ? "video/webm;codecs=vp9,opus" : captureMime,
        });
      }
    console.log(
      "Acquisizione sintetica in tempo reale 1280x720, 12 FPS; durate",
      durations.join(", "),
      "secondi",
    );
    await page.evaluate(async (descriptors) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      const ac = new AudioContext(),
        osc = ac.createOscillator(),
        gain = ac.createGain(),
        dest = ac.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dest);
      osc.frequency.value = 440;
      osc.start();
      await ac.resume();
      const begun = performance.now();
      const draw = () => {
        const t = (performance.now() - begun) / 1000;
        ctx.fillStyle = Math.floor(t) % 10 === 9 ? "#fff" : "#17405a";
        ctx.fillRect(0, 0, 1280, 720);
        ctx.fillStyle = "#f0ac43";
        ctx.fillRect((t * 90) % 1100, 220, 120, 180);
        ctx.fillStyle = "#fff";
        ctx.font = "48px sans-serif";
        ctx.fillText(t.toFixed(2), 40, 80);
        gain.gain.value = Math.floor(t) % 10 === 9 ? 0.25 : 0;
      };
      draw();
      const clock = setInterval(draw, 1000 / 12),
        stream = canvas.captureStream(12);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      for (const duration of [...new Set(descriptors.map((d) => d.duration))])
        await Promise.all(
          descriptors
            .filter((d) => d.duration === duration)
            .map(
              (d) =>
                new Promise((resolve, reject) => {
                  // The 5-minute capture starts after the 1-minute capture, durations are run sequentially to keep concurrent encoder load bounded.
                  const delay = 0;
                  setTimeout(() => {
                    const mime = d.mime;
                    if (!MediaRecorder.isTypeSupported(mime))
                      return reject(
                        Error("Unsupported capture codec: " + mime),
                      );
                    const recorder = new MediaRecorder(stream, {
                      mimeType: mime,
                      videoBitsPerSecond: 1393778,
                      audioBitsPerSecond: 192000,
                    });
                    let writes = Promise.resolve();
                    recorder.ondataavailable = (e) => {
                      if (e.data.size)
                        writes = writes.then(async () =>
                          window.benchWrite(
                            d.id,
                            Array.from(
                              new Uint8Array(await e.data.arrayBuffer()),
                            ),
                          ),
                        );
                    };
                    recorder.onerror = (e) =>
                      reject(e.error || Error("MediaRecorder failure"));
                    recorder.onstop = () => writes.then(resolve, reject);
                    recorder.start(1000);
                    setTimeout(() => recorder.stop(), d.duration * 1000);
                  }, delay);
                }),
            ),
        );
      clearInterval(clock);
      stream.getTracks().forEach((t) => t.stop());
      await ac.close();
    }, descriptors);
    for (const q of queues.values()) await q;
    for (const h of handles.values()) await h.close();
    handles.clear();
    for (const d of descriptors)
      if (d.mode === "after")
        await fs.copyFile(recordings.get(d.id).input, d.file);
    console.log(
      "Acquisizioni concluse; misurazione seriale della finalizzazione",
    );
    await app.close();
    app = null;
    // Measure stages one at a time to avoid concurrent finalizers distorting Stop costs.
    for (const d of descriptors) {
      const output = path.join(out, d.id + "-ready.mp4"),
        start = performance.now();
      let finalizationMs,
        copyMs = 0;
      if (d.mode === "before") {
        await run(ffmpeg, [
          "-v",
          "error",
          "-nostdin",
          "-y",
          "-i",
          d.file,
          "-vf",
          "fps=12,scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-threads",
          "2",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          output,
        ]);
        finalizationMs = performance.now() - start;
      } else {
        const r = recordings.get(d.id),
          at = performance.now();
        await r.finish();
        finalizationMs = performance.now() - at;
        copyMs = r.metrics.copyMs;
        await r.dispose();
        recordings.delete(d.id);
      }
      const probeAt = performance.now();
      const meta = JSON.parse(
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
        ),
        importMs = performance.now() - probeAt;
      const tail = (
        await run(
          ffmpeg,
          [
            "-v",
            "error",
            "-sseof",
            "-1",
            "-i",
            output,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
          ],
          { encoding: "buffer", maxBuffer: 4e6 },
        )
      ).stdout;
      const tailPresent = tail.length > 0;
      const waveAt = performance.now();
      await waveform(output, ffmpeg);
      const waveformMs = performance.now() - waveAt;
      const result = {
        mode: d.mode,
        captureMime: d.mime,
        videoBitrate: 1393778,
        requestedSeconds: d.duration,
        duration: Number(meta.format.duration),
        streams: meta.streams.map((s) => ({
          type: s.codec_type,
          codec: s.codec_name,
          width: s.width,
          height: s.height,
          fps: s.avg_frame_rate,
          start: s.start_time,
          duration: s.duration,
        })),
        finalizationMs,
        copyMs,
        importMs,
        waveformMs,
        tailBytes: tail.length,
        tailPresent,
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await fs.writeFile(
        path.join(out, "results.json"),
        JSON.stringify(
          {
            synthetic: true,
            capture:
              "Electron MediaRecorder real time; one VP9 and one MP4 recorder share a synthetic canvas; durations run sequentially; finalization measured serially after capture",
            results,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    for (const h of handles.values()) await h.close().catch(() => {});
    for (const r of recordings.values()) await r.dispose().catch(() => {});
    if (app) await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
