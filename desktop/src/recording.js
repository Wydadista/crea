const fs = require("node:fs/promises"),
  path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { encoding } = require("./render");
const RecordingPolicy = require("./recording-policy");
// MediaRecorder MP4/H.264 is remuxed, never encoded a second time. On runtimes
// without MP4 capture, conversion runs concurrently with capture, with backpressure.
class Recording {
  constructor(ffmpeg, dir, output, settings, notify = () => {}) {
    Object.assign(this, { ffmpeg, dir, output, settings, notify });
    this.started = performance.now();
    this.bytes = 0;
    this.error = null;
    this.native =
      settings.mime?.startsWith("video/mp4") ||
      settings.format === "webm" ||
      settings.audioOnly;
  }
  async begin() {
    this.input = path.join(
      this.dir,
      this.settings.audioOnly
        ? "capture.webm"
        : this.settings.mime?.startsWith("video/mp4")
          ? "capture.mp4"
          : "capture.webm",
    );
    this.handle = await fs.open(this.input, "w");
    if (!this.native) {
      const cfg = encoding(this.settings);
      this.live = path.join(this.dir, "encoded.mp4");
      this.copyVideo = /h264|avc1/i.test(this.settings.mime || "");
      const args = [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        "pipe:0",
        ...(this.copyVideo
          ? ["-c:v", "copy"]
          : [
              "-vf",
              "pad=ceil(iw/2)*2:ceil(ih/2)*2",
              "-c:v",
              "libx264",
              "-preset",
              "veryfast",
              "-crf",
              String(RecordingPolicy.fallbackCrf(this.settings)),
              "-threads",
              String(require("./encoders").threadBudget()),
              "-pix_fmt",
              "yuv420p",
            ]),
        "-c:a",
        "aac",
        "-b:a",
        `${this.settings.audioBitrate}k`,
        "-movflags",
        "+frag_keyframe+empty_moov",
        this.live,
      ];
      this.child = spawn(this.ffmpeg, args, { windowsHide: true });
      let stderr = "";
      this.child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
      this.child.stdin.on("error", (e) => (this.error = e));
      this.done = new Promise((resolve) => {
        this.child.once("error", (e) => {
          this.error = e;
          resolve();
        });
        this.child.once("close", (code) => {
          if (code)
            this.error ||= Error(stderr || "Conversione registrazione fallita");
          resolve();
        });
      });
    }
    return this;
  }
  async append(bytes) {
    if (this.error) throw this.error;
    const data = Buffer.from(bytes);
    let at = 0;
    while (at < data.length)
      at += (await this.handle.write(data, at)).bytesWritten;
    this.bytes += data.length;
    if (this.child && !this.child.stdin.write(data))
      await once(this.child.stdin, "drain");
    if (this.error) throw this.error;
  }
  async finish() {
    const stop = performance.now();
    this.notify({
      phase: "Finalizzazione file",
      bytes: this.bytes,
      percent: null,
    });
    await this.handle.close();
    this.handle = null;
    if (this.child) {
      this.child.stdin.end();
      await this.done;
      if (this.error) throw this.error;
    }
    const finalized = path.join(
      this.dir,
      this.settings.audioOnly ? "final.wav" : `final.${this.settings.format}`,
    );
    const args = [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-progress",
      "pipe:1",
      "-nostats",
      "-i",
      this.live || this.input,
    ];
    if (this.settings.audioOnly)
      args.push("-vn", "-c:a", "pcm_s16le", "-ac", "2");
    else if (this.settings.format === "mp4")
      args.push(
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
      );
    else args.push("-c", "copy");
    this.notify({
      phase: this.settings.audioOnly
        ? "Finalizzazione audio"
        : "Assemblaggio contenitore (nessuna ricodifica video)",
      percent: null,
    });
    await new Promise((resolve, reject) => {
      const child = spawn(this.ffmpeg, [...args, finalized], {
        windowsHide: true,
      });
      let error = "",
        pending = "";
      child.stdout.on("data", (data) => {
        pending += data;
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines)
          if (line.startsWith("out_time_us=")) {
            const seconds = Number(line.slice(12)) / 1e6,
              duration = this.settings.captureDuration;
            if (Number.isFinite(seconds))
              this.notify({
                phase: "Assemblaggio file",
                processedSeconds: seconds,
                percent: duration
                  ? Math.min(99, Math.floor((seconds / duration) * 100))
                  : null,
              });
          }
      });
      child.stderr.on("data", (d) => (error = (error + d).slice(-4000)));
      child.once("error", reject);
      child.once("close", (code) => (code ? reject(Error(error)) : resolve()));
    });
    const finalizedMs = performance.now() - stop;
    this.notify({ phase: "Scrittura file pronto", percent: null });
    const copyAt = performance.now();
    await fs.copyFile(finalized, this.output);
    this.metrics = {
      finalizationMs: finalizedMs,
      copyMs: performance.now() - copyAt,
      videoReencoded: !!this.live && !this.copyVideo,
      conversionDuringCapture: !!this.live,
      bytes: this.bytes,
      captureInfo: this.settings.captureInfo,
      profile: this.settings.profile || "balanced",
    };
    this.notify({
      phase: "File pronto; importazione metadati",
      percent: 100,
      metrics: this.metrics,
    });
    return this.output;
  }
  async dispose() {
    if (this.child && this.child.exitCode === null) {
      this.child.kill();
      await this.done;
    }
    await this.handle?.close().catch(() => {});
    this.handle = null;
    await fs.rm(this.dir, { recursive: true, force: true });
  }
}
module.exports = { Recording };
