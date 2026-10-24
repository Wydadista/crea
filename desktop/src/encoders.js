const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
function threadBudget() {
  let count = require("node:os").availableParallelism();
  try {
    const [quota, period] = require("node:fs")
      .readFileSync("/sys/fs/cgroup/cpu.max", "utf8")
      .trim()
      .split(" ");
    if (quota !== "max")
      count = Math.min(
        count,
        Math.max(1, Math.ceil(Number(quota) / Number(period))),
      );
  } catch {}
  return Math.max(1, Math.min(8, count));
}
const candidates = [
  ["h264_nvenc", "GPU NVIDIA"],
  ["h264_qsv", "GPU Intel"],
  ["h264_amf", "GPU AMD"],
  ["h264_videotoolbox", "GPU Apple"],
];
const args = (encoder, crf, preset = "veryfast") =>
  encoder === "cpu"
    ? ["-c:v", "libx264", "-preset", preset, "-crf", String(crf)]
    : encoder === "h264_nvenc"
      ? ["-c:v", encoder, "-cq", String(crf), "-b:v", "0"]
      : encoder === "h264_qsv"
        ? ["-c:v", encoder, "-global_quality", String(crf)]
        : encoder === "h264_amf"
          ? [
              "-c:v",
              encoder,
              "-rc",
              "cqp",
              "-qp_i",
              String(crf),
              "-qp_p",
              String(crf),
            ]
          : [
              "-c:v",
              encoder,
              "-b:v",
              `${Math.max(1000, Math.round(20000 / (crf - 10)))}k`,
            ];
async function detect(ffmpeg, config = {}) {
  const out = [];
  for (const [id, label] of candidates)
    try {
      await run(
        ffmpeg,
        [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          // Tiny probes can fall below a working hardware encoder's minimum size.
          // Keep explicit export dimensions so unsupported exports still fall back.
          `color=s=${config.width || 640}x${config.height || 360}:r=25`,
          "-frames:v",
          "10",
          ...args(id, 23),
          "-pix_fmt",
          config.pixelFormat || "yuv420p",
          "-f",
          "null",
          "-",
        ],
        { timeout: 10000, windowsHide: true },
      );
      out.push({ id, label });
    } catch {}
  return out;
}
module.exports = { detect, args, candidates, threadBudget };
