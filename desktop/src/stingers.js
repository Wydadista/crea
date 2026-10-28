"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
const T = require("./model"),
  { collectProject, atomic } = require("./storage"),
  { pathToFileURL } = require("node:url");
class StingerStore {
  constructor(root) {
    this.root = root;
  }
  folder(id) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id))
      throw Error("Stacchetto non valido");
    return path.join(this.root, id);
  }
  async save(project, ids, name) {
    const preset = T.makeStinger(
        T.validate(structuredClone(project)),
        ids,
        name,
      ),
      id = randomUUID(),
      folder = this.folder(id);
    const p = T.empty();
    p.media = preset.content.media;
    p.clips = preset.content.clips;
    p.canvasSize = project.canvasSize;
    while (T.trackCount(p) <= Math.max(...p.clips.map((c) => c.track)))
      T.addTrack(p);
    try {
      await collectProject(
        T.validate(p),
        path.join(folder, "stinger.creastudio"),
        { includeRecordings: true },
      );
      await atomic(path.join(folder, "preset.json"), {
        id,
        name: preset.name,
        duration: preset.duration,
      });
      return id;
    } catch (e) {
      await fs.rm(folder, { recursive: true, force: true });
      throw e;
    }
  }
  async load(id) {
    const folder = this.folder(id),
      info = JSON.parse(
        await fs.readFile(path.join(folder, "preset.json"), "utf8"),
      );
    const p = JSON.parse(
      await fs.readFile(path.join(folder, "stinger.creastudio"), "utf8"),
    );
    for (const m of p.media) {
      if (!m.path || ["annotation", "effect"].includes(m.kind)) continue;
      const file = path.resolve(folder, m.path),
        relative = path.relative(folder, file);
      if (
        relative === ".." ||
        relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)
      )
        throw Error("Percorso media dello stacchetto non valido");
      await fs.access(file);
      m.path = file;
      m.url = pathToFileURL(file).href;
    }
    T.validate(p);
    return {
      ...info,
      version: 1,
      content: { media: p.media, clips: p.clips },
      canvasSize: p.canvasSize,
    };
  }
  async list() {
    await fs.mkdir(this.root, { recursive: true });
    const result = [];
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
      try {
        await fs.access(path.join(this.folder(entry.name), "preset.json"));
      } catch {
        continue;
      }
      try {
        const p = await this.load(entry.name);
        const m = p.content.media.find((m) =>
          ["video", "image"].includes(m.kind),
        );
        const c = p.content.clips.find((c) => c.mediaId === m?.id);
        result.push({
          id: entry.name,
          name: p.name,
          duration: p.duration,
          total: T.total(p.content.clips),
          preview: m,
          previewAt: c?.in || 0,
        });
      } catch (e) {
        result.push({
          id: entry.name,
          name: "Stacchetto non disponibile",
          error: e.message,
        });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  async remove(id) {
    await fs.rm(path.join(this.folder(id), "preset.json"), { force: true });
  }
}
module.exports = { StingerStore };
