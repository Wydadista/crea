const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Timeline = require("./model");
const profiles = { small: 30, balanced: 23, high: 18 };
async function renderProject(
  project,
  output,
  settings,
  binaries,
  progress = () => {},
  signal,
) {
  Timeline.validate(project);
  if (!project.clips.length)
    throw Error("Aggiungi almeno un video o immagine alla timeline");
  const height = Number(settings.height),
    fps = Number(settings.fps);
  if (
    ![720, 1080, 1440, 2160].includes(height) ||
    ![24, 25, 30, 60].includes(fps) ||
    !Object.hasOwn(profiles, settings.quality)
  )
    throw Error("Impostazioni export non valide");
  const width = Math.round((height * 16) / 9 / 2) * 2;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "crea-export-"));
  const run = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        binaries.ffmpeg,
        ["-hide_banner", "-loglevel", "error", "-nostdin", ...args],
        { windowsHide: true, signal },
      );
      let error = "";
      child.stderr.on("data", (d) => {
        error = (error + d).slice(-6000);
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(Error(error || "Esportazione interrotta")),
      );
    });
  try {
    for (let i = 0; i < project.clips.length; i++) {
      const c = project.clips[i],
        m = project.media.find((m) => m.id === c.mediaId);
      const duration = Timeline.duration(c);
      const args = ["-y"];
      if (m.kind === "image") args.push("-loop", "1", "-i", m.path);
      else args.push("-ss", String(c.in), "-i", m.path);
      if (!m.hasAudio || m.kind === "image")
        args.push(
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      args.push(
        "-t",
        String(duration),
        "-map",
        "0:v:0",
        "-map",
        m.hasAudio && m.kind !== "image" ? "0:a:0" : "1:a:0",
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`,
        "-af",
        `volume=${c.volume},apad`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        String(profiles[settings.quality]),
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-video_track_timescale",
        "90000",
        path.join(temp, `${i}.mp4`),
      );
      await run(args);
      progress({
        percent: Math.round(((i + 1) / (project.clips.length + 1)) * 90),
        message: `Clip ${i + 1}/${project.clips.length}`,
      });
    }
    // Relative filenames are generated integers, never user-controlled concat directives.
    await fs.writeFile(
      path.join(temp, "list.txt"),
      project.clips.map((_, i) => `file '${i}.mp4'`).join("\n"),
    );
    const joined = path.join(temp, "joined.mp4");
    await run([
      "-y",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      path.join(temp, "list.txt"),
      "-c",
      "copy",
      joined,
    ]);
    const staged = path.join(temp, "final.mp4");
    if (project.music.length) {
      const args = ["-y", "-i", joined];
      const filters = ["[0:a]anull[a0]"];
      project.music.forEach((c, i) => {
        const m = project.media.find((m) => m.id === c.mediaId);
        args.push(
          "-ss",
          String(c.in),
          "-t",
          String(Timeline.duration(c)),
          "-i",
          m.path,
        );
        filters.push(
          `[${i + 1}:a]volume=${c.volume},adelay=${Math.round(c.start * 1000)}:all=1[a${i + 1}]`,
        );
      });
      filters.push(
        `${Array.from({ length: project.music.length + 1 }, (_, i) => `[a${i}]`).join("")}amix=inputs=${project.music.length + 1}:duration=first:normalize=0,alimiter=limit=0.95[a]`,
      );
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[a]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-t",
        String(Timeline.total(project.clips)),
        "-movflags",
        "+faststart",
        staged,
      );
      await run(args);
    } else
      await run([
        "-y",
        "-i",
        joined,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        staged,
      ]);
    if (signal?.aborted) throw Error("Esportazione annullata");
    await fs.copyFile(staged, output);
    progress({ percent: 100, message: "Esportazione completata" });
    return output;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
module.exports = { renderProject };
