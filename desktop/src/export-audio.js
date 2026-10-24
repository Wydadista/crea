const { spawn } = require("node:child_process");

// Feed completed PCM segments to one continuous AAC encoder while the next
// video segment renders. Never encode AAC independently at each cut: that
// would introduce encoder priming and audible gaps between segments.
function createAudioPipeline(ffmpeg, output, signal, onProgress = () => {}) {
  let failure,
    reader,
    stopped = false,
    seconds = 0;
  const launch = (args, stdio) => {
    const child = spawn(
      ffmpeg,
      ["-hide_banner", "-v", "error", "-nostdin", ...args],
      { windowsHide: true, signal, stdio },
    );
    let stderr = "",
      error;
    child.stderr.on("data", (data) => {
      stderr = (stderr + data).slice(-8000);
    });
    child.once("error", (e) => {
      error = e;
    });
    const done = new Promise((resolve, reject) => {
      child.once("close", (code) =>
        code === 0 && !error
          ? resolve()
          : reject(error || Error(stderr || "Elaborazione audio interrotta")),
      );
    });
    // A process may fail before finish() or the queued reader awaits it.
    done.catch(() => {});
    return { child, done };
  };
  const encoder = launch(
    [
      "-y",
      "-probesize",
      "32",
      "-analyzeduration",
      "0",
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-i",
      "pipe:0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-progress",
      "pipe:1",
      "-stats_period",
      "0.05",
      "-nostats",
      output,
    ],
    ["pipe", "pipe", "pipe"],
  );
  const fail = (error) => {
    failure ||= error;
    reader?.child.kill();
  };
  encoder.done.catch(fail);
  encoder.child.stdin.on("error", (error) => {
    fail(error);
    encoder.child.kill();
  });
  let pending = "";
  encoder.child.stdout.on("data", (data) => {
    pending += data.toString();
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("out_time_us=")) continue;
      const at = Number(line.slice(12)) / 1e6;
      if (Number.isFinite(at)) {
        seconds = Math.max(seconds, at);
        onProgress(seconds);
      }
    }
  });
  const check = () => {
    if (failure) throw failure;
    signal?.throwIfAborted();
    if (stopped) throw Error("Elaborazione audio interrotta");
  };
  let queue = Promise.resolve();
  return {
    get seconds() {
      return seconds;
    },
    enqueue(file, samples) {
      check();
      queue = queue.then(async () => {
        check();
        reader = launch(
          [
            "-threads",
            "1",
            "-i",
            file,
            "-map",
            "0:a:0",
            "-vn",
            // Use cumulative timeline sample boundaries, including silent gaps,
            // so rounding never accumulates across hundreds of fractional cuts.
            "-af",
            `apad,atrim=end_sample=${samples}`,
            "-c:a",
            "pcm_s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-f",
            "s16le",
            "pipe:1",
          ],
          ["ignore", "pipe", "pipe"],
        );
        const current = reader;
        current.child.stdout.pipe(encoder.child.stdin, { end: false });
        try {
          await current.done;
          check();
        } finally {
          current.child.stdout.unpipe(encoder.child.stdin);
          reader = undefined;
        }
      });
      queue.catch(fail);
      return queue;
    },
    async finish() {
      await queue;
      check();
      encoder.child.stdin.end();
      await encoder.done;
      check();
    },
    async dispose() {
      stopped = true;
      const active = reader;
      active?.child.kill();
      encoder.child.stdin.destroy();
      encoder.child.kill();
      await Promise.allSettled([queue, encoder.done, active?.done]);
    },
  };
}

module.exports = { createAudioPipeline };
