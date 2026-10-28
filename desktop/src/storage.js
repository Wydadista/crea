const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
async function atomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2));
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
function safeName(name, fallback = "Registrazione") {
  const clean = String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 100);
  return !clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)
    ? fallback
    : clean;
}
async function reserveRecording(dir, name, extension, minimum = 1) {
  await fs.mkdir(dir, { recursive: true });
  name = safeName(name);
  // Existing files are the durable counter, including after application restarts.
  let next = Math.max(1, minimum);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escaped + "-(\\d+)\\.(mp4|webm|wav)$", "i");
  for (const entry of await fs.readdir(dir)) {
    const m = entry.match(re);
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  for (;;) {
    const file = path.join(dir, `${name}-${next++}.${extension}`);
    try {
      const h = await fs.open(file, "wx");
      await h.close();
      return file;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
}
async function collectProject(project, file, options = {}) {
  const copy = structuredClone(project),
    base = path.dirname(file),
    assets = path.join(base, "Media");
  await fs.mkdir(assets, { recursive: true });
  copy.assetsCollected = true;
  const resolved = new Map();
  for (const m of copy.media) {
    if (!m.path || ["annotation", "effect"].includes(m.kind)) continue;
    const source = path.resolve(m.path);
    const recordingRelative = options.recordingsDirectory
      ? path.relative(path.resolve(options.recordingsDirectory), source)
      : null;
    const inRecordings =
      recordingRelative !== null &&
      recordingRelative !== ".." &&
      !recordingRelative.startsWith(".." + path.sep) &&
      !path.isAbsolute(recordingRelative);
    if (
      !options.includeRecordings &&
      (m.recorded === true || m.recordingInfo || inRecordings)
    ) {
      await fs.access(source);
      m.path = source;
      m.recorded = true;
      delete m.url;
      continue;
    }
    if (!resolved.has(source)) {
      const stat = await fs.stat(source);
      let dest;
      const rel = path.relative(base, source);
      if (
        !rel.startsWith(".." + path.sep) &&
        rel !== ".." &&
        !path.isAbsolute(rel)
      )
        dest = source;
      else {
        const key = createHash("sha256")
          .update(source + ":" + stat.size + ":" + stat.mtimeMs)
          .digest("hex")
          .slice(0, 20);
        dest = path.join(assets, key + "-" + safeName(path.basename(source)));
        try {
          await fs.access(dest);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
          const temp = dest + "." + randomUUID() + ".tmp";
          try {
            await fs.copyFile(source, temp);
            await fs.rename(temp, dest);
          } finally {
            await fs.rm(temp, { force: true });
          }
        }
      }
      resolved.set(source, dest);
    }
    m.path = path
      .relative(base, resolved.get(source))
      .split(path.sep)
      .join("/");
    delete m.url;
  }
  await atomic(file, copy);
  return copy;
}
module.exports = { atomic, safeName, reserveRecording, collectProject };
