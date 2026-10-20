/* Shared timeline rules: visual clips are magnetic; music has an independent offset. */
(function (root) {
  const api = {
    duration: (clip) => Math.max(0, clip.out - clip.in),
    total(clips) {
      return clips.reduce((sum, c) => sum + api.duration(c), 0);
    },
    locate(clips, time) {
      let start = 0;
      for (let i = 0; i < clips.length; i++) {
        const end = start + api.duration(clips[i]);
        if (time < end)
          return {
            clip: clips[i],
            index: i,
            start,
            local: clips[i].in + Math.max(0, time - start),
          };
        start = end;
      }
      return null;
    },
    split(clips, id, time, newId) {
      let start = 0;
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i],
          d = api.duration(c);
        if (c.id === id) {
          const offset = time - start;
          if (offset < 0.05 || offset > d - 0.05) return false;
          const cut = c.in + offset;
          clips.splice(i, 1, { ...c, out: cut }, { ...c, id: newId, in: cut });
          return true;
        }
        start += d;
      }
      return false;
    },
    validate(project) {
      if (
        !project ||
        project.version !== 1 ||
        !Array.isArray(project.media) ||
        !Array.isArray(project.clips) ||
        !Array.isArray(project.music)
      )
        throw Error("Formato progetto non valido");
      if (
        project.media.length > 1000 ||
        project.clips.length > 500 ||
        project.music.length > 100
      )
        throw Error("Progetto troppo grande");
      const ids = new Set();
      for (const m of project.media) {
        if (
          !m ||
          typeof m.id !== "string" ||
          ids.has(m.id) ||
          typeof m.path !== "string" ||
          typeof m.name !== "string" ||
          !["video", "image", "audio"].includes(m.kind) ||
          !Number.isFinite(m.duration) ||
          m.duration <= 0
        )
          throw Error("Media non valido");
        ids.add(m.id);
      }
      const clipIds = new Set();
      for (const [list, audio] of [
        [project.clips, false],
        [project.music, true],
      ])
        for (const c of list) {
          const m = project.media.find((m) => m.id === c?.mediaId);
          if (
            !c ||
            typeof c.id !== "string" ||
            clipIds.has(c.id) ||
            !m ||
            (audio ? m.kind !== "audio" : m.kind === "audio") ||
            !Number.isFinite(c.in) ||
            !Number.isFinite(c.out) ||
            c.in < 0 ||
            c.out <= c.in ||
            c.out > (m.kind === "image" ? 86400 : m.duration) + 0.01 ||
            !Number.isFinite(c.volume) ||
            c.volume < 0 ||
            c.volume > 1 ||
            (audio && (!Number.isFinite(c.start) || c.start < 0))
          )
            throw Error("Clip non valida");
          clipIds.add(c.id);
        }
      return project;
    },
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.Timeline = api;
})(globalThis);
