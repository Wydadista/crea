/* Absolute time, exclusive tracks and ripple limited to one timeline insertion. */
(function (root) {
  const n = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  const api = {
    MAX_TRACKS: 128,
    MIN_TRACK_HEIGHT: 32,
    empty: () => ({
      version: 2,
      trackCount: 1,
      defaultTrackHeight: 100,
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
    insertTrack(p, index) {
      const count = api.trackCount(p);
      if (
        count >= api.MAX_TRACKS ||
        !Number.isInteger(index) ||
        index < 0 ||
        index > count
      )
        throw Error("Impossibile inserire la traccia");
      p.trackHeights ||= Array(count).fill(100);
      p.trackMuted ||= Array(count).fill(false);
      p.trackHeights.splice(index, 0, p.defaultTrackHeight ?? 100);
      p.trackMuted.splice(index, 0, false);
      for (const c of p.clips) {
        if (c.track >= index) c.track++;
        if (c.speedHomeTrack !== undefined && c.speedHomeTrack >= index)
          c.speedHomeTrack++;
      }
      p.trackCount = count + 1;
      return index;
    },
    removeTrack(p, index) {
      const count = api.trackCount(p);
      if (!Number.isInteger(index) || index < 0 || index >= count)
        throw Error("Traccia non valida");
      p.clips = p.clips.filter((c) => c.track !== index);
      for (const c of p.clips) {
        if (c.track > index) c.track--;
        if (c.speedHomeTrack === index) delete c.speedHomeTrack;
        else if (c.speedHomeTrack > index) c.speedHomeTrack--;
      }
      p.trackHeights ||= Array(count).fill(100);
      p.trackMuted ||= Array(count).fill(false);
      p.trackHeights.splice(index, 1);
      p.trackMuted.splice(index, 1);
      p.trackCount = Math.max(1, count - 1);
      if (count === 1) {
        p.trackHeights = [p.defaultTrackHeight ?? 100];
        p.trackMuted = [false];
      }
    },
    addTrack(p) {
      if (api.trackCount(p) >= api.MAX_TRACKS)
        throw Error("Limite di 128 tracce raggiunto");
      p.trackCount = api.trackCount(p) + 1;
      p.trackHeights ||= Array(p.trackCount - 1).fill(100);
      p.trackMuted ||= Array(p.trackCount - 1).fill(false);
      p.trackHeights.push(p.defaultTrackHeight ?? 100);
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
      return c.sourceInstanceId || c.id;
    },
    colorSource(c) {
      return c.colorSourceId || api.sourceFamily(c);
    },
    clipColor(c) {
      let hash = 2166136261;
      for (const char of api.colorSource(c))
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      hash ^= hash >>> 16;
      hash = Math.imul(hash, 0x85ebca6b);
      hash ^= hash >>> 13;
      return `hsl(${(hash >>> 0) % 360} 42% 27%)`;
    },
    closeTrimGap(p, previous, trimmed) {
      const start = Math.min(...previous.map((c) => c.start));
      const end = Math.max(...previous.map((c) => c.start + api.duration(c)));
      const head = Math.max(
        0,
        Math.min(...trimmed.map((c) => c.start)) - start,
      );
      const tail = Math.max(
        0,
        end - Math.max(...trimmed.map((c) => c.start + api.duration(c))),
      );
      if (head < 1e-8 && tail < 1e-8) return;
      const ids = new Set(trimmed.map((c) => c.id));
      const track = previous[0].track;
      // Preserve source cuts and attach the shortened unit to its predecessor.
      const preceding = p.clips.filter(
        (c) =>
          !ids.has(c.id) &&
          c.track === track &&
          c.start + api.duration(c) <= start + 1e-8,
      );
      const anchor =
        head > 1e-8 && preceding.length
          ? Math.max(...preceding.map((c) => c.start + api.duration(c)))
          : start;
      const shift = head + (head > 1e-8 ? Math.max(0, start - anchor) : 0);
      for (const c of trimmed) c.start -= shift;
      const families = new Set(
        previous.map((c) => c.sourceInstanceId).filter(Boolean),
      );
      const following = p.clips.filter(
        (c) =>
          !ids.has(c.id) &&
          c.track === track &&
          families.has(c.sourceInstanceId) &&
          c.start >= end - 1e-8,
      );
      const positions = following.map((c) => c.start);
      for (const c of following) c.start -= shift + tail;
      // Another source can block the downstream ripple. Keep the actual trim and
      // its left attachment rather than undoing the user's source cut on release.
      if (api.overlaps(p.clips))
        following.forEach((c, i) => {
          c.start = positions[i];
        });
    },
    trimFamilySegment(input, id, trimmed, closeGaps = false) {
      const p = JSON.parse(JSON.stringify(input)),
        old = input.clips.find((c) => c.id === id),
        c = p.clips.find((c) => c.id === id);
      if (!old || !c) throw Error("Clip non disponibile");
      Object.assign(c, {
        in: trimmed.in,
        out: trimmed.out,
        start: trimmed.start,
      });
      if (closeGaps) api.closeTrimGap(p, [old], [c]);
      if (!api.canPlace(input.clips, p.clips))
        throw Error(
          "Chiusura spazio bloccata da un’altra clip: nessuna modifica applicata",
        );
      return api.validate(p);
    },
    copySelection(p, ids) {
      const clips = p.clips.filter((c) => ids.includes(c.id));
      if (!clips.length) throw Error("Seleziona gli elementi da copiare");
      const used = new Set(clips.map((c) => c.mediaId));
      return JSON.parse(
        JSON.stringify({
          clips: clips.map((c) => ({
            ...c,
            colorSourceId: api.colorSource(c),
          })),
          media: p.media.filter((m) => used.has(m.id)),
        }),
      );
    },
    pasteSelection(input, clipboard, start, track, makeId) {
      if (!clipboard?.clips?.length) throw Error("Nessun elemento copiato");
      if (
        !n(start, 0, 604800) ||
        !Number.isInteger(track) ||
        track < 0 ||
        track >= api.trackCount(input)
      )
        throw Error("Posizione o traccia di destinazione non valida");
      if (input.clips.length + clipboard.clips.length > 1000)
        throw Error("Limite di 1000 elementi raggiunto");
      const p = JSON.parse(JSON.stringify(input)),
        content = JSON.parse(JSON.stringify(clipboard)),
        timeOrigin = Math.min(...content.clips.map((c) => c.start)),
        trackOrigin = Math.min(...content.clips.map((c) => c.track)),
        mapping = () => new Map(),
        ids = mapping(),
        families = mapping(),
        groups = mapping(),
        links = mapping(),
        media = mapping(),
        remap = (map, key) => {
          if (!map.has(key)) map.set(key, makeId());
          return map.get(key);
        };
      for (const m of content.media) {
        const existing = p.media.find(
          (other) =>
            other.id === m.id && other.path === m.path && other.kind === m.kind,
        );
        const id = existing?.id || makeId();
        media.set(m.id, id);
        if (!existing) p.media.push({ ...m, id });
      }
      for (const c of content.clips) remap(ids, c.id);
      const added = content.clips.map((c) => {
        const next = {
          ...c,
          id: ids.get(c.id),
          colorSourceId: api.colorSource(c),
          mediaId: media.get(c.mediaId),
          sourceInstanceId: remap(families, api.sourceFamily(c)),
          start: start + c.start - timeOrigin,
          track: track + c.track - trackOrigin,
        };
        if (c.groupId) next.groupId = remap(groups, c.groupId);
        if (c.linkId) next.linkId = remap(links, c.linkId);
        if (c.joinedSegments)
          next.joinedSegments = c.joinedSegments.map((segment) => ({
            ...segment,
            colorSourceId: api.colorSource(segment),
            id: remap(ids, segment.id),
            mediaId: media.get(segment.mediaId),
            sourceInstanceId: remap(families, api.sourceFamily(segment)),
            groupId: next.groupId,
            ...(segment.linkId ? { linkId: remap(links, segment.linkId) } : {}),
            start: start + segment.start - timeOrigin,
            track: track + segment.track - trackOrigin,
          }));
        if (c.detachedFrom && ids.has(c.detachedFrom))
          next.detachedFrom = ids.get(c.detachedFrom);
        else delete next.detachedFrom;
        delete next.speedHomeTrack;
        return next;
      });
      if (!api.canPlace(p.clips, added))
        throw Error(
          "Spazio insufficiente per incollare: nessun elemento è stato modificato",
        );
      const lastTrack = Math.max(...added.map((c) => c.track));
      while (api.trackCount(p) <= lastTrack) api.addTrack(p);
      p.clips.push(...added);
      return { project: api.validate(p), ids: added.map((c) => c.id) };
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
      // An unselected clip always separates runs. Only selected neighbours can
      // move to accommodate one another; their existing gaps stay intact.
      const selectedIds = new Set(ids),
        runs = [];
      let run = null,
        lastTrack = -1;
      for (const c of [...p.clips].sort(
        (a, b) => a.track - b.track || a.start - b.start,
      )) {
        if (c.track !== lastTrack || !selectedIds.has(c.id)) run = null;
        lastTrack = c.track;
        if (!selectedIds.has(c.id)) continue;
        if (!run) {
          run = [];
          runs.push(run);
        }
        run.push(c);
      }
      for (const clips of runs) {
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
          delete c.speedHomeTrack;
          newEnd = c.start + api.duration(c);
        }
      }
      if (api.overlaps(p.clips))
        throw Error(
          "Spazio insufficiente sulla traccia: nessuna modifica applicata. Sposta le altre clip per lasciare spazio.",
        );
      api.validate(p);
      return p;
    },
    detachAudio(input, clipId, makeId) {
      const p = JSON.parse(JSON.stringify(input));
      api.validate(p);
      const video = p.clips.find((c) => c.id === clipId),
        media = video && p.media.find((m) => m.id === video.mediaId);
      if (
        !video ||
        media.kind !== "video" ||
        !media.hasAudio ||
        video.audioDetached
      )
        throw Error(
          "Questa clip non ha audio da separare o è già stata separata.",
        );
      if (p.clips.length >= 1000 || p.media.length >= 1000)
        throw Error("Limite di elementi del progetto raggiunto");
      const muted = !!video.muted || !!p.trackMuted?.[video.track];
      const track = api.insertTrack(p, video.track + 1),
        id = makeId(),
        mediaId = makeId();
      const audioMedia = {
        ...media,
        id: mediaId,
        kind: "audio",
        name: "Audio · " + media.name,
      };
      delete audioMedia.width;
      delete audioMedia.height;
      delete audioMedia.fps;
      delete audioMedia.codec;
      p.media.push(audioMedia);
      const audio = {
        ...JSON.parse(JSON.stringify(video)),
        id,
        mediaId,
        track,
        muted,
        sourceInstanceId: id,
        colorSourceId: api.colorSource(video),
        detachedFrom: video.id,
      };
      for (const key of [
        "groupId",
        "linkId",
        "joinedSegments",
        "layout",
        "zoom",
        "effect",
        "annotation",
        "aspectUnlocked",
        "speedHomeTrack",
        "audioDetached",
      ])
        delete audio[key];
      video.muted = true;
      video.audioDetached = true;
      p.clips.push(audio);
      api.validate(p);
      return { project: p, audioId: id };
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
        c.colorSourceId ||= api.colorSource(c);
        c.sourceInstanceId ||= c.id;
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
    contiguousRuns(clips) {
      const sorted = [...clips].sort(
          (a, b) => a.track - b.track || a.start - b.start,
        ),
        runs = [];
      for (const c of sorted) {
        const run = runs.at(-1),
          previous = run?.at(-1);
        if (
          previous &&
          previous.track === c.track &&
          Math.abs(c.start - previous.start - api.duration(previous)) <= 1e-8
        )
          run.push(c);
        else runs.push([c]);
      }
      return runs;
    },
    groupSelected(clips, ids, makeId, acrossTracks = false) {
      const chosen = clips.filter((c) => ids.includes(c.id));
      chosen.forEach((c) => {
        delete c.groupId;
        delete c.joinedSegments;
      });
      const runs =
        acrossTracks && new Set(chosen.map((c) => c.track)).size > 1
          ? [chosen]
          : [...new Set(chosen.map(api.sourceFamily))].flatMap((family) =>
              api.contiguousRuns(
                chosen.filter((c) => api.sourceFamily(c) === family),
              ),
            );
      for (const run of runs)
        if (run.length > 1) {
          const id = makeId();
          run.forEach((c) => (c.groupId = id));
        }
    },
    linkedIds(clips, ids) {
      const result = new Set(ids);
      let size;
      do {
        size = result.size;
        for (const key of ["groupId", "linkId"]) {
          const groups = new Set(
            clips
              .filter((c) => result.has(c.id))
              .map((c) => c[key])
              .filter(Boolean),
          );
          for (const c of clips) if (groups.has(c[key])) result.add(c.id);
        }
      } while (size !== result.size);
      return [...result];
    },
    linkSelected(clips, ids, makeId) {
      const chosen = api.linkedIds(clips, ids);
      if (chosen.length < 2) return;
      const id = makeId();
      for (const c of clips) if (chosen.includes(c.id)) c.linkId = id;
    },
    splitTargets(clips, ids, time) {
      const crossed = clips.filter(
        (c) => time - c.start > 1e-8 && c.start + api.duration(c) - time > 1e-8,
      );
      if (ids.length)
        return crossed.filter((c) => ids.includes(c.id)).map((c) => c.id);
      if (crossed.length > 1)
        throw Error(
          "Più elementi sotto il cursore: seleziona quello da tagliare",
        );
      return crossed.map((c) => c.id);
    },
    cutSelection(input, ids) {
      const clipboard = api.copySelection(input, ids);
      const project = JSON.parse(JSON.stringify(input));
      project.clips = project.clips.filter((c) => !ids.includes(c.id));
      return { project, clipboard };
    },
    trimJoined(input, id, side, delta, closeGaps = false) {
      const p = JSON.parse(JSON.stringify(input));
      const clip = p.clips.find((c) => c.id === id);
      if (!clip?.groupId) throw Error("Elemento non unito");
      const visible = p.clips
        .filter((c) => c.groupId === clip.groupId)
        .sort((a, b) => a.start - b.start);
      const archive = visible.find((c) => c.joinedSegments)?.joinedSegments;
      const members = archive
        ? JSON.parse(JSON.stringify(archive))
        : JSON.parse(JSON.stringify(visible));
      if (archive) {
        const anchor = visible[0],
          original = members.find((c) => c.id === anchor.id);
        const offset =
          anchor.start -
          original.start -
          (anchor.in - original.in) / (original.speed || 1);
        const trackDelta = anchor.track - original.track;
        for (const c of members) {
          c.start += offset;
          c.track += trackDelta;
        }
      }
      for (const c of members) {
        const current = visible.find((v) => v.id === c.id);
        if (current) {
          const {
            in: sourceIn,
            out: sourceOut,
            start: sourceStart,
            ...properties
          } = current;
          Object.assign(c, properties);
        }
        c.groupId = clip.groupId;
        if (clip.linkId) c.linkId = clip.linkId;
        else delete c.linkId;
      }
      const saved = JSON.parse(JSON.stringify(members));
      for (const c of saved) delete c.joinedSegments;
      const first = members[0],
        last = members.at(-1);
      if ((side === "left" ? visible[0] : visible.at(-1)).id !== id)
        throw Error(
          "Separa gli elementi uniti per modificare i confini interni",
        );
      const start = visible[0].start,
        end = visible.at(-1).start + api.duration(visible.at(-1));
      const edge =
        side === "left"
          ? Math.max(
              0,
              first.start - first.in / (first.speed || 1),
              Math.min(end - 0.02, start + delta),
            )
          : Math.max(start + 0.02, end + delta);
      const left = side === "left" ? edge : start;
      const right = side === "right" ? edge : end;
      const result = [];
      for (const c of members) {
        const rate = c.speed || 1,
          oldEnd = c.start + api.duration(c);
        const media = p.media.find((m) => m.id === c.mediaId);
        const limit = ["image", "annotation", "effect"].includes(media.kind)
          ? 86400
          : media.duration;
        const from = c === first ? left : Math.max(left, c.start);
        const to = c === last ? right : Math.min(right, oldEnd);
        if (to - from < 0.001) continue;
        c.out = Math.min(limit, c.in + (to - c.start) * rate);
        c.in += (from - c.start) * rate;
        c.start = from;
        delete c.joinedSegments;
        result.push(c);
      }
      if (!result.length) throw Error("Durata non valida");
      result[0].joinedSegments = saved;
      p.clips = p.clips
        .filter((c) => c.groupId !== clip.groupId)
        .concat(result);
      if (closeGaps) api.closeTrimGap(p, visible, result);
      if (!api.canPlace([], p.clips)) throw Error("Intervallo occupato");
      return api.validate(p);
    },
    snapMove(clips, origins, delta, trackDelta, options = {}) {
      if (!options.enabled) return { delta, latch: null };
      const scale = options.scale || 40,
        ids = new Set(origins.map((o) => o.c.id)),
        candidates = [];
      for (const o of origins)
        for (const other of clips) {
          if (ids.has(other.id) || other.track !== o.track + trackDelta)
            continue;
          for (const edge of ["start", "end"]) {
            const otherEnd = other.start + api.duration(other),
              originalEnd = o.start + api.duration(o.c);
            const previous = Number.isFinite(options.previousDelta)
              ? options.previousDelta
              : 0;
            if (
              trackDelta === 0 &&
              (edge === "start"
                ? o.start < otherEnd - 1e-8 &&
                  o.start + previous < otherEnd - 1e-8
                : originalEnd > other.start + 1e-8 &&
                  originalEnd + previous > other.start + 1e-8)
            )
              continue;
            const source =
              edge === "start" ? o.start : o.start + api.duration(o.c);
            const target =
              edge === "start"
                ? other.start + api.duration(other)
                : other.start;
            const desired = target - source,
              distance = Math.abs(delta - desired) * scale;
            const key = o.c.id + ":" + other.id + ":" + edge + ":" + trackDelta;
            const held = options.latch?.key === key && distance <= 28;
            const crossed =
              Number.isFinite(options.previousDelta) &&
              (options.previousDelta - desired) * (delta - desired) <= 0;
            if (!held && distance > 16 && !(crossed && distance <= 24))
              continue;
            const proposal = origins.map((x) => ({
              ...x.c,
              start: x.start + desired,
              track: x.track + trackDelta,
            }));
            if (!api.canPlace(clips, proposal)) continue;
            candidates.push({
              delta: desired,
              distance,
              held,
              latch: {
                key,
                at: target,
                edge,
                originId: o.c.id,
                otherId: other.id,
                trackDelta,
              },
            });
          }
        }
      candidates.sort(
        (a, b) => Number(b.held) - Number(a.held) || a.distance - b.distance,
      );
      const best = candidates[0];
      return best
        ? { delta: best.delta, latch: best.latch }
        : { delta, latch: null };
    },
    rulerLabels(scale, scrollLeft, width, measure) {
      const steps = [
        0.001, 0.002, 0.005, 0.01, 0.02, 0.025, 0.03, 0.05, 0.1, 0.2, 0.25, 0.3,
        0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 45, 60,
        90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 7200,
        14400, 28800, 86400, 172800, 604800,
      ];
      const format = (time, step) => {
        const decimals = Math.min(3, (String(step).split(".")[1] || "").length);
        const rounded = Number(time.toFixed(decimals)),
          minutes = Math.floor(rounded / 60);
        const seconds = (rounded - minutes * 60)
          .toFixed(decimals)
          .padStart(decimals ? 3 + decimals : 2, "0");
        return (
          String(minutes).padStart(2, "0") + ":" + seconds.replace(".", ",")
        );
      };
      const start = scrollLeft / scale,
        end = (scrollLeft + width) / scale;
      const raw = width / scale / 7;
      let step = steps.reduce(
          (best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best),
          steps[0],
        ),
        labels = [];
      for (let attempt = 0; attempt < steps.length; attempt++) {
        labels = [];
        let right = -Infinity,
          overlap = false;
        for (
          let i = Math.ceil((start - 1e-9) / step);
          i * step <= end + 1e-9;
          i++
        ) {
          const time = Number((i * step).toFixed(6)),
            text = format(time, step),
            left = time * scale - scrollLeft + 4,
            w = measure(text);
          if (left + w > width - 2) continue;
          if (left < right + 16) overlap = true;
          labels.push({ time, text });
          right = left + w;
        }
        if (!overlap && labels.length <= 8) break;
        const next = steps.find((s) => s > step);
        if (!next) break;
        step = next;
      }
      return { step, labels };
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
          (c.groupId !== undefined && typeof c.groupId !== "string") ||
          (c.linkId !== undefined && typeof c.linkId !== "string") ||
          (c.colorSourceId !== undefined && typeof c.colorSourceId !== "string")
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
        if (
          c.audioDetached !== undefined &&
          typeof c.audioDetached !== "boolean"
        )
          throw Error("Stato audio separato non valido");
        if (c.detachedFrom !== undefined && typeof c.detachedFrom !== "string")
          throw Error("Origine audio separato non valida");
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
        p.defaultTrackHeight !== undefined &&
        !n(p.defaultTrackHeight, api.MIN_TRACK_HEIGHT, 600)
      )
        throw Error("Altezza tracce non valida");
      if (
        p.trackHeights &&
        (!Array.isArray(p.trackHeights) ||
          p.trackHeights.length !== p.trackCount ||
          p.trackHeights.some((h) => !n(h, api.MIN_TRACK_HEIGHT, 600)))
      )
        throw Error("Altezza tracce non valida");
      if (
        p.trackMuted &&
        (!Array.isArray(p.trackMuted) ||
          p.trackMuted.length !== p.trackCount ||
          p.trackMuted.some((v) => typeof v !== "boolean"))
      )
        throw Error("Tracce non valide");
      // Earlier projects also used groupId for explicit cross-track links.
      // Keep those links, without treating their separate clips as joined cuts.
      const legacyGroups = new Set(
        p.clips.map((c) => c.groupId).filter(Boolean),
      );
      for (const id of legacyGroups) {
        const members = p.clips.filter((c) => c.groupId === id);
        if (new Set(members.map((c) => c.track)).size < 2) continue;
        for (const c of members) {
          c.linkId ||= `legacy-${id}`;
          delete c.groupId;
          delete c.joinedSegments;
        }
      }
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
