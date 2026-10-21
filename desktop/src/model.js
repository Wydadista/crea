/* Absolute time, exclusive tracks, explicit snapping and no ripple editing. */
(function (root) {
  const n = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  const api = {
    MAX_TRACKS: 128,
    empty: () => ({
      version: 2,
      trackCount: 1,
      trackHeights: [100],
      trackMuted: [false],
      media: [],
      clips: [],
    }),
    trackCount: (p) =>
      p.trackCount ??
      Math.max(
        1,
        ...p.clips.map((c) => c.track + 1),
        p.trackHeights?.length || 0,
        p.trackMuted?.length || 0,
      ),
    addTrack(p) {
      if (api.trackCount(p) >= api.MAX_TRACKS)
        throw Error("Limite di 128 tracce raggiunto");
      p.trackCount = api.trackCount(p) + 1;
      p.trackHeights ||= Array(p.trackCount - 1).fill(100);
      p.trackMuted ||= Array(p.trackCount - 1).fill(false);
      p.trackHeights.push(100);
      p.trackMuted.push(false);
      return p.trackCount - 1;
    },
    overlaps(clips) {
      const tracks = new Map();
      for (const c of clips) {
        if (!tracks.has(c.track)) tracks.set(c.track, []);
        tracks.get(c.track).push(c);
      }
      for (const row of tracks.values()) {
        row.sort((a, b) => a.start - b.start);
        for (let i = 1; i < row.length; i++)
          if (row[i].start < row[i - 1].start + api.duration(row[i - 1]) - 1e-8)
            return true;
      }
      return false;
    },
    canPlace(clips, candidates) {
      const ids = new Set(candidates.map((c) => c.id));
      return (
        candidates.every(
          (c) =>
            c.start >= 0 &&
            Number.isInteger(c.track) &&
            c.track >= 0 &&
            c.track < api.MAX_TRACKS,
        ) &&
        !api.overlaps([...clips.filter((c) => !ids.has(c.id)), ...candidates])
      );
    },
    deleteFamilySegments(input, ids, closeGaps = false) {
      const p = JSON.parse(JSON.stringify(input)),
        selected = new Set(ids);
      const removed = p.clips.filter((c) => selected.has(c.id));
      p.clips = p.clips.filter((c) => !selected.has(c.id));
      if (closeGaps) {
        // Identity belongs to an insertion, never to a file. Legacy fragments with
        // no identity are independent; guessing by mediaId would move other inserts.
        for (const c of p.clips) {
          const holes = removed.filter(
            (r) =>
              r.sourceInstanceId &&
              r.sourceInstanceId === c.sourceInstanceId &&
              r.track === c.track &&
              r.start < c.start,
          );
          const shift = holes.reduce(
            (sum, r) =>
              sum + Math.max(0, Math.min(api.duration(r), c.start - r.start)),
            0,
          );
          c.start = Math.max(0, c.start - shift);
        }
        if (api.overlaps(p.clips))
          throw Error(
            "Chiusura spazio bloccata da un’altra clip: nessuna clip è stata spostata",
          );
      }
      return api.validate(p);
    },
    muteRange(input, ids, start, end, makeId) {
      if (!n(start, 0, 604800) || !n(end, start + 0.001, 604800))
        throw Error("Intervallo non valido");
      const p = JSON.parse(JSON.stringify(input));
      const chosen = new Set(ids);
      for (const at of [start, end]) {
        const added = [];
        api.split(p.clips, [...chosen], at, () => {
          const id = makeId();
          added.push(id);
          return id;
        });
        added.forEach((id) => chosen.add(id));
      }
      for (const c of p.clips)
        if (
          chosen.has(c.id) &&
          c.start >= start - 1e-8 &&
          c.start + api.duration(c) <= end + 1e-8
        )
          c.muted = true;
      return api.validate(p);
    },
    sourceFamily(c) {
      return c.sourceInstanceId || c.mediaId;
    },
    familyIds(p, ids) {
      const families = new Set(
        p.clips.filter((c) => ids.includes(c.id)).map(api.sourceFamily),
      );
      return p.clips
        .filter((c) => families.has(api.sourceFamily(c)))
        .map((c) => c.id);
    },
    retime(input, ids, speed) {
      const p = JSON.parse(JSON.stringify(input));
      api.validate(p);
      const chosen = p.clips.filter((c) => ids.includes(c.id));
      if (!chosen.length) return p;
      const groups = new Map();
      for (const c of chosen) {
        const key = api.sourceFamily(c);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      }
      const proposals = [];
      for (const clips of groups.values()) {
        clips.sort(
          (a, b) =>
            a.start - b.start || p.clips.indexOf(a) - p.clips.indexOf(b),
        );
        let oldEnd, newEnd;
        for (const c of clips) {
          const oldSpeed = c.speed || 1,
            oldStart = c.start,
            oldDuration = api.duration(c);
          const target =
            speed === null ? (c.speedReference ?? 1) : api.parseSpeed(speed);
          if (speed !== null && target > oldSpeed && !c.workSpeedActive) {
            c.speedReference =
              c.speedReference === undefined && oldSpeed > 1 ? 1 : oldSpeed;
            c.workSpeedActive = true;
          }
          if (speed === null) c.workSpeedActive = false;
          c.start =
            oldEnd === undefined
              ? oldStart
              : newEnd + Math.max(0, oldStart - oldEnd);
          oldEnd = oldStart + oldDuration;
          c.speed = target;
          newEnd = c.start + api.duration(c);
          proposals.push(c);
        }
      }
      // Unaffected clips never move. Reserve all original/home-track positions first,
      // so an overflow fragment cannot displace another fragment that fits at home.
      const chosenIds = new Set(chosen.map((c) => c.id));
      const placed = p.clips.filter((c) => !chosenIds.has(c.id)),
        overflow = [];
      proposals.sort((a, b) => a.start - b.start);
      for (const c of proposals) {
        const home = c.speedHomeTrack ?? c.track;
        c.track = home;
        if (api.canPlace(placed, [c])) placed.push(c);
        else overflow.push({ c, home });
      }
      for (const { c, home } of overflow) {
        let track = -1;
        for (let t = 0; t < p.trackCount; t++)
          if (t !== home && api.canPlace(placed, [{ ...c, track: t }])) {
            track = t;
            break;
          }
        if (track < 0) track = api.addTrack(p);
        c.track = track;
        c.speedHomeTrack = home;
        placed.push(c);
      }
      api.validate(p);
      return p;
    },
    projectSize(p) {
      if (p.canvasSize) return { ...p.canvasSize };
      const m = p.media.find(
        (m) =>
          ["video", "image"].includes(m.kind) &&
          Number.isInteger(m.width) &&
          Number.isInteger(m.height) &&
          m.width >= 2 &&
          m.height >= 2,
      );
      return m
        ? { width: m.width, height: m.height }
        : { width: 1920, height: 1080 };
    },
    outputSize(p, height) {
      if (height === "original") return api.projectSize(p);
      const h = Number(height);
      if (![720, 1080, 1440, 2160].includes(h))
        throw Error("Risoluzione non valida");
      const size = api.projectSize(p);
      return {
        width: Math.round((h * size.width) / size.height / 2) * 2,
        height: h,
      };
    },
    resizeBox(box, handle, dx, dy, locked = true) {
      let left = box.x,
        top = box.y,
        right = box.x + box.width,
        bottom = box.y + box.height;
      if (handle.includes("w")) left += dx;
      if (handle.includes("e")) right += dx;
      if (handle.includes("n")) top += dy;
      if (handle.includes("s")) bottom += dy;
      let width = Math.max(1, right - left),
        height = Math.max(1, bottom - top);
      if (locked) {
        const fx = width / box.width,
          fy = height / box.height;
        const factor =
          handle.length === 1
            ? handle === "e" || handle === "w"
              ? fx
              : fy
            : Math.abs(fx - 1) > Math.abs(fy - 1)
              ? fx
              : fy;
        width = box.width * factor;
        height = box.height * factor;
        if (handle.includes("w")) left = box.x + box.width - width;
        else if (!handle.includes("e")) left = box.x + (box.width - width) / 2;
        if (handle.includes("n")) top = box.y + box.height - height;
        else if (!handle.includes("s")) top = box.y + (box.height - height) / 2;
      }
      return { x: left, y: top, width, height };
    },
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
    move(
      clips,
      ids,
      delta,
      td = 0,
      trackCount = Math.max(1, ...clips.map((c) => c.track + 1)),
    ) {
      const chosen = clips.filter((c) => ids.includes(c.id));
      if (!chosen.length) return;
      delta = Math.max(delta, -Math.min(...chosen.map((c) => c.start)));
      td = Math.max(
        -Math.min(...chosen.map((c) => c.track)),
        Math.min(trackCount - 1 - Math.max(...chosen.map((c) => c.track)), td),
      );
      const proposals = chosen.map((c) => ({
        ...c,
        start: c.start + delta,
        track: c.track + td,
      }));
      if (!api.canPlace(clips, proposals)) return false;
      for (const c of chosen) {
        c.start += delta;
        c.track += td;
      }
      return true;
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
      // Legacy projects had implicit tracks and allowed overlaps. Keep every cut and
      // source time, allocating separate lanes only when those old tracks overlap.
      if (p.trackCount === undefined) {
        let count = api.trackCount(p);
        if (api.overlaps(p.clips)) {
          const oldHeights = p.trackHeights,
            oldMuted = p.trackMuted,
            heights = [],
            muted = [];
          let next = 0;
          const originalRows = Array.from({ length: count }, (_, track) =>
            p.clips.filter((c) => c.track === track),
          );
          for (let track = 0; track < count; track++) {
            const row = originalRows[track];
            const split = api.overlaps(row);
            const slots = split ? Math.max(1, row.length) : 1;
            row.forEach((c, i) => {
              c.track = next + (split ? i : 0);
            });
            for (let i = 0; i < slots; i++) {
              heights.push(oldHeights?.[track] || 100);
              muted.push(oldMuted?.[track] || false);
            }
            next += slots;
          }
          count = next;
          p.trackHeights = heights;
          p.trackMuted = muted;
        }
        p.trackCount = count;
      }
      if (
        !Number.isInteger(p.trackCount) ||
        p.trackCount < 1 ||
        p.trackCount > api.MAX_TRACKS
      )
        throw Error("Numero tracce non valido (1–128)");
      p.trackHeights ||= Array(p.trackCount).fill(100);
      p.trackMuted ||= Array(p.trackCount).fill(false);
      p.canvasSize ||= api.projectSize(p);
      if (
        ![p.canvasSize.width, p.canvasSize.height].every(
          (v) => Number.isInteger(v) && v >= 2 && v <= 8192,
        )
      )
        throw Error("Dimensioni progetto non valide");
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
          c.track >= p.trackCount ||
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
        if (
          c.sourceInstanceId !== undefined &&
          typeof c.sourceInstanceId !== "string"
        )
          throw Error("Sorgente clip non valida");
        if (c.speedReference !== undefined && !n(c.speedReference, 0.1, 16))
          throw Error("Velocità di riferimento non valida");
        if (
          c.workSpeedActive !== undefined &&
          typeof c.workSpeedActive !== "boolean"
        )
          throw Error("Riferimento velocità non valido");
        if (
          c.speedHomeTrack !== undefined &&
          (!Number.isInteger(c.speedHomeTrack) ||
            c.speedHomeTrack < 0 ||
            c.speedHomeTrack >= p.trackCount)
        )
          throw Error("Traccia di riferimento non valida");
        if (
          c.aspectUnlocked !== undefined &&
          typeof c.aspectUnlocked !== "boolean"
        )
          throw Error("Proporzioni non valide");
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
        if (c.layout?.content) {
          const b = c.layout.content;
          if (
            !n(b.x, 0, 100) ||
            !n(b.y, 0, 100) ||
            !n(b.width, 1e-6, 100 - b.x + 0.001) ||
            !n(b.height, 1e-6, 100 - b.y + 0.001)
          )
            throw Error("Geometria visiva non valida");
        }
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
          p.trackHeights.length !== p.trackCount ||
          p.trackHeights.some((h) => !n(h, 80, 600)))
      )
        throw Error("Altezza tracce non valida");
      if (
        p.trackMuted &&
        (!Array.isArray(p.trackMuted) ||
          p.trackMuted.length !== p.trackCount ||
          p.trackMuted.some((v) => typeof v !== "boolean"))
      )
        throw Error("Tracce non valide");
      if (api.overlaps(p.clips))
        throw Error(
          "Intervallo occupato: usa uno spazio libero o un’altra traccia.",
        );
      return p;
    },
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.Timeline = api;
})(globalThis);
