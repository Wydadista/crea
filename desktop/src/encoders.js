const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);
const candidates = [
  ["h264_nvenc", "GPU NVIDIA"],
  ["h264_qsv", "GPU Intel"],
  ["h264_amf", "GPU AMD"],
  ["h264_videotoolbox", "GPU Apple"],
];
const args = (encoder, crf) =>
  encoder === "cpu"
    ? ["-c:v", "libx264", "-preset", "fast", "-crf", String(crf)]
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
async function detect(ffmpeg) {
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
          "color=s=128x128:r=25",
          "-frames:v",
          "2",
          ...args(id, 23),
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
module.exports = { detect, args, candidates };
