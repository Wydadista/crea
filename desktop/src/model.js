/* Absolute time, independent layers, no magnetic/ripple editing. */
(function (root) {
  const n = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  const api = {
    empty: () => ({ version: 2, media: [], clips: [] }),
    parseSpeed(value) {
      const text = String(value).trim().replace(",", ".");
      if (!/^[0-9]+(?:\.[0-9]+)?$/.test(text))
        throw Error("Inserisci una velocità numerica, ad esempio 2,4");
      const speed = Number(text);
      if (speed === 0) return 1;
      if (!n(speed, 0.1, 16)) throw Error("Velocità consentita: 0,1–16×");
      return speed;
    },
    duration: (c) => (c.out - c.in) / (c.speed || 1),
    total: (clips) =>
      Math.max(0, ...clips.map((c) => c.start + api.duration(c))),
    sourceTime: (c, t) => c.in + (t - c.start) * (c.speed || 1),
    active: (clips, t) =>
      clips
        .filter((c) => t >= c.start && t < c.start + api.duration(c))
        .sort((a, b) => a.track - b.track),
    migrate(p) {
      if (p?.version !== 1) return p;
      let start = 0;
      return {
        version: 2,
        media: p.media,
        clips: [
          ...p.clips.map((c) => {
            const next = { ...c, start, track: 0, speed: 1 };
            start += c.out - c.in;
            return next;
          }),
          ...p.music.map((c) => ({ ...c, track: 1, speed: 1 })),
        ],
      };
    },
    split(clips, ids, time, makeId) {
      const selected = new Set(Array.isArray(ids) ? ids : [ids]);
      let count = 0;
      for (let i = clips.length - 1; i >= 0; i--) {
        const c = clips[i];
        if (!selected.has(c.id)) continue;
        const offset = time - c.start,
          d = api.duration(c);
        if (offset < 0.02 || offset > d - 0.02) continue;
        const cut = api.sourceTime(c, time),
          id = typeof makeId === "function" ? makeId() : makeId;
        clips.splice(
          i,
          1,
          { ...JSON.parse(JSON.stringify(c)), out: cut },
          { ...JSON.parse(JSON.stringify(c)), id, in: cut, start: time },
        );
        count++;
      }
      return count;
    },
    move(clips, ids, delta, td = 0) {
      const chosen = clips.filter((c) => ids.includes(c.id));
      if (!chosen.length) return;
      delta = Math.max(delta, -Math.min(...chosen.map((c) => c.start)));
      td = Math.max(
        -Math.min(...chosen.map((c) => c.track)),
        Math.min(2 - Math.max(...chosen.map((c) => c.track)), td),
      );
      for (const c of chosen) {
        c.start += delta;
        c.track += td;
      }
    },
    snap(clips, origins, delta, trackDelta, threshold) {
      const ids = new Set(origins.map((o) => o.c.id));
      let correction = threshold + 1;
      for (const o of origins)
        for (const other of clips) {
          if (ids.has(other.id) || other.track !== o.track + trackDelta)
            continue;
          for (const [edge, target] of [
            [o.start, other.start + api.duration(other)],
            [o.start + api.duration(o.c), other.start],
          ]) {
            const d = target - edge - delta;
            if (Math.abs(d) <= threshold && Math.abs(d) < Math.abs(correction))
              correction = d;
          }
        }
      return Math.max(
        -Math.min(...origins.map((o) => o.start)),
        delta + (Math.abs(correction) <= threshold ? correction : 0),
      );
    },
    groups(clips) {
      const out = [],
        seen = new Set();
      for (const c of clips) {
        const key = c.id;
        if (seen.has(key)) continue;
        seen.add(key);
        const members = [c];
        out.push({
          key,
          groupId: c.groupId,
          track: c.track,
          start: Math.min(...members.map((x) => x.start)),
          end: Math.max(...members.map((x) => x.start + api.duration(x))),
          members,
        });
      }
      return out;
    },
    validate(input) {
      const p = api.migrate(input);
      if (
        !p ||
        p.version !== 2 ||
        !Array.isArray(p.media) ||
        !Array.isArray(p.clips) ||
        p.media.length > 1000 ||
        p.clips.length > 1000
      )
        throw Error("Progetto non valido");
      const media = new Map(),
        ids = new Set();
      for (const m of p.media) {
        if (
          !m ||
          typeof m.id !== "string" ||
          media.has(m.id) ||
          typeof m.name !== "string" ||
          !["video", "audio", "image", "annotation", "effect"].includes(
            m.kind,
          ) ||
          !n(m.duration, 0.001, 86400 * 7) ||
          (!["annotation", "effect"].includes(m.kind) &&
            typeof m.path !== "string")
        )
          throw Error("Media non valido");
        media.set(m.id, m);
      }
      for (const c of p.clips) {
        const m = media.get(c?.mediaId);
        if (
          !c ||
          typeof c.id !== "string" ||
          ids.has(c.id) ||
          !m ||
          !n(c.start, 0, 86400 * 7) ||
          !Number.isInteger(c.track) ||
          c.track < 0 ||
          c.track > 2 ||
          !n(c.in, 0, 86400 * 7) ||
          !n(
            c.out,
            c.in + 0.001,
            ["image", "annotation", "effect"].includes(m.kind)
              ? 86400
              : m.duration + 0.01,
          ) ||
          !n(c.volume, 0, 1) ||
          !n(c.speed ?? 1, 0.1, 16) ||
          (c.groupId !== undefined && typeof c.groupId !== "string")
        )
          throw Error("Clip non valida");
        if (c.muted !== undefined && typeof c.muted !== "boolean")
          throw Error("Audio non valido");
        if (c.mono !== undefined && typeof c.mono !== "boolean")
          throw Error("Mono non valido");
        if (c.voice && (!n(c.voice.noise, 0, 1) || !n(c.voice.level, 0, 1)))
          throw Error("Voce non valida");
        if (c.layout)
          for (const [k, lo, hi] of [
            ["x", -100, 100],
            ["y", -100, 100],
            ["width", 1, 200],
            ["height", 1, 200],
          ])
            if (!n(c.layout[k], lo, hi)) throw Error("Posizione non valida");
        if (c.zoom) {
          for (const k of ["from", "to"])
            if (!n(c.zoom[k], 1, 5)) throw Error("Zoom non valido");
          for (const k of ["x", "y"])
            if (!n(c.zoom[k], 0, 1)) throw Error("Centro zoom non valido");
        }
        if (c.effect) {
          const e = c.effect;
          if (
            !["none", "blur", "pixel"].includes(e.type) ||
            !n(e.strength, 1, 100) ||
            !n(e.x, 0, 99) ||
            !n(e.y, 0, 99) ||
            !n(e.width, 1, 100 - e.x + 0.001) ||
            !n(e.height, 1, 100 - e.y + 0.001)
          )
            throw Error("Area effetto non valida");
        }
        if (m.kind === "annotation") {
          const a = c.annotation;
          if (
            !a ||
            !["text", "arrow", "circle"].includes(a.type) ||
            typeof a.text !== "string" ||
            a.text.length > 5000 ||
            typeof a.font !== "string" ||
            a.font.length > 200 ||
            !/^#[0-9a-f]{6}$/i.test(a.color) ||
            !/^#[0-9a-f]{6}$/i.test(a.background) ||
            typeof a.backgroundEnabled !== "boolean" ||
            !n(a.x, 0, 100) ||
            !n(a.y, 0, 100) ||
            !n(a.size, 8, 400) ||
            !n(a.length, 1, 100) ||
            !n(a.angle, -360, 360) ||
            !n(a.lineWidth, 1, 50) ||
            !n(a.animate, 0, 2)
          )
            throw Error("Annotazione non valida");
        }
        if (c.annotation?.width !== undefined && !n(c.annotation.width, 1, 100))
          throw Error("Riquadro testo non valido");
        ids.add(c.id);
      }
      if (
        p.trackHeights &&
        (!Array.isArray(p.trackHeights) ||
          p.trackHeights.length !== 3 ||
          p.trackHeights.some((h) => !n(h, 80, 600)))
      )
        throw Error("Altezza tracce non valida");
      if (
        p.trackMuted &&
        (!Array.isArray(p.trackMuted) ||
          p.trackMuted.length !== 3 ||
          p.trackMuted.some((v) => typeof v !== "boolean"))
      )
        throw Error("Tracce non valide");
      return p;
    },
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.Timeline = api;
})(globalThis);
