"use strict";
// A joined sequence has one time ruler; source cuts are implementation details.
function sequenceScope(c = first()) {
  if (c?.parentId) c = project.clips.find((p) => p.id === c.parentId);
  return c ? Timeline.sequence(project.clips, c) : null;
}
function sequenceOwner(scope) {
  return scope.members[0];
}
attachElement = function (parent, type) {
  const scope = sequenceScope(parent);
  if (type === "zoom") return applyZoomFromGallery(scope);
  if (type === "denoise") return applyDenoiseFromGallery(scope);
  if (!scope || scope.members.some((c) => (c.attachments?.length || 0) >= 64))
    return;
  checkpoint();
  const owner = sequenceOwner(scope),
    { a, m } = decoration(type, {
      ...owner,
      in: 0,
      out: scope.end - scope.start,
    });
  const applicationId = uid();
  project.media.push(m);
  const ids = [];
  for (const c of scope.members) {
    const child = {
      ...clone(a),
      id: uid(),
      applicationId,
      parentId: c.id,
      sourceIn: c.in + (scope.start - c.start) * (c.speed || 1),
      sourceOut: c.in + (scope.end - c.start) * (c.speed || 1),
    };
    (c.attachments ||= []).push(child);
    ids.push(child.id);
  }
  expandedClips.add(owner.id);
  selection = new Set(ids);
  previewFocus = ids[0];
  changed();
};
edit = function (mutator) {
  const before = clone(project);
  pause();
  try {
    for (const c of selected()) mutator(c);
    for (const c of selected())
      if (c.applicationId && c.parentId)
        for (const other of Timeline.allClips(project))
          if (other.applicationId === c.applicationId)
            for (const key of ["annotation", "effect", "layout"])
              if (c[key]) other[key] = clone(c[key]);
    Timeline.validate(project);
    if (JSON.stringify(project) === JSON.stringify(before)) return;
    history.push(JSON.stringify(before));
    future = [];
    changed();
  } catch (error) {
    project = before;
    toast(error.message);
    properties();
  }
};
function sequenceFrames(scope) {
  const c = sequenceOwner(scope),
    z = c.zoom;
  if (z?.keys?.length)
    return z.keys.map((k) => ({
      ...k,
      time: c.start - scope.start + (k.time - c.in) / (c.speed || 1),
    }));
  const d = scope.end - scope.start;
  return Timeline.zoomEnvelope(
    [
      { time: 0, scale: z?.from || 1, x: 0.5, y: 0.5 },
      { time: 0, scale: z?.to || 2, x: z?.x ?? 0.5, y: z?.y ?? 0.5 },
      { time: 0, scale: z?.to || 2, x: z?.x ?? 0.5, y: z?.y ?? 0.5 },
      { time: d, scale: z?.from || 1, x: 0.5, y: 0.5 },
    ],
    0,
    d,
    2,
    2,
  );
}
function zoomDurations(scope) {
  const z = sequenceOwner(scope).zoom;
  if (!z?.keys?.length) return { entry: 2, exit: 2 };
  const frames = sequenceFrames(scope);
  return {
    entry: z.entryDuration ?? Math.max(0.01, frames[1].time - frames[0].time),
    exit:
      z.exitDuration ?? Math.max(0.01, frames.at(-1).time - frames.at(-2).time),
  };
}
function saveSequenceFrames(
  scope,
  frames,
  checkpointNow = true,
  timing = null,
) {
  if (checkpointNow) checkpoint();
  Timeline.sequenceZoom(
    project.clips,
    sequenceOwner(scope),
    frames,
    sequenceOwner(scope).zoom?.applicationId || uid(),
    timing || zoomDurations(scope),
  );
  expandedClips.add(sequenceOwner(scope).id);
}
function applyMotion() {
  const scope = sequenceScope();
  if (!scope) return;
  const timing = {
    entry: Number($("zoomEntryDuration").value),
    exit: Number($("zoomExitDuration").value),
  };
  const frames = sequenceFrames(scope);
  try {
    const next = Timeline.zoomEnvelope(
      frames,
      frames[0].time,
      frames.at(-1).time,
      timing.entry,
      timing.exit,
    );
    saveSequenceFrames(scope, next, true, timing);
    changed();
  } catch (error) {
    toast(error.message);
    properties();
  }
}
$("zoomEntryDuration").onchange = $("zoomExitDuration").onchange = applyMotion;

$("applyMotion").onclick = applyMotion;
function removeSequenceZoom(scope) {
  if (!scope) return;
  pause();
  checkpoint();
  scope.members.forEach((c) => delete c.zoom);
  frameEditing = false;
  $("pickZoomFrame").setAttribute("aria-pressed", "false");
  selection = new Set(scope.members.map((c) => c.id));
  changed();
}
$("removeMotion").onclick = () => removeSequenceZoom(sequenceScope());

let frameEditing = false;
const frameBox = el("div", "zoom-frame-box");
frameBox.hidden = true;
$("previewSurface").append(frameBox);
const frameHandle = el("span", "zoom-frame-handle");
frameBox.append(frameHandle);
const zoomOutput = el("output");
$("visualZoom").after(zoomOutput);
// Coordinates remain available internally for older project files, but editing is visual.
for (const id of [
  "motionFromX",
  "motionFromY",
  "motionToX",
  "motionToY",
  "zoomX",
  "zoomY",
  "zoomTo",
  "zoomFrom",
]) {
  $(id).closest("label").hidden = true;
}
$("pickZoomFrame").textContent = "Scegli il dettaglio nell’anteprima";
$("visualZoom").max = "20";
function endpointIndex() {
  return $("motionEndpoint").value === "start" ? 0 : 1;
}
function paintFrameBox() {
  const scope = sequenceScope();
  frameBox.hidden = !frameEditing || !scope;
  if (frameBox.hidden) return;
  const r = previewRect(),
    surface = $("previewSurface").getBoundingClientRect(),
    k = sequenceFrames(scope)[endpointIndex()],
    w = r.width / k.scale,
    h = r.height / k.scale;
  Object.assign(frameBox.style, {
    left: r.left - surface.left + (r.width - w) * k.x + "px",
    top: r.top - surface.top + (r.height - h) * k.y + "px",
    width: w + "px",
    height: h + "px",
  });
}
function focusMotionEndpoint() {
  const scope = sequenceScope();
  if (!scope) return;
  const frames = sequenceFrames(scope),
    k = frames[endpointIndex()];
  seek(
    Math.max(scope.start, Math.min(scope.end - 0.001, scope.start + k.time)),
  );
  paintFrameBox();
}
$("motionEndpoint").onchange = () => {
  properties();
  if (frameEditing) focusMotionEndpoint();
};
$("pickZoomFrame").onclick = () => {
  const scope = sequenceScope();
  if (!scope) return;
  frameEditing = !frameEditing;
  $("pickZoomFrame").setAttribute("aria-pressed", String(frameEditing));
  if (frameEditing) {
    if (!sequenceOwner(scope).zoom?.keys) {
      saveSequenceFrames(scope, sequenceFrames(scope));
      changed();
    }
    focusMotionEndpoint();
  }
  draw();
  paintFrameBox();
};
const drawBefore41 = draw;
draw = function () {
  drawBefore41();
  paintFrameBox();
};
const propertiesBefore41 = properties;
properties = function () {
  propertiesBefore41();
  const scope = sequenceScope();
  if (!scope) return;
  const f = sequenceFrames(scope),
    i = endpointIndex();
  if (!document.activeElement?.closest("#motionControls")) {
    const timing = zoomDurations(scope);
    $("zoomEntryDuration").value = timing.entry;
    $("zoomExitDuration").value = timing.exit;
  }
  $("visualZoom").value = f[i].scale;
  zoomOutput.textContent = f[i].scale.toFixed(2) + "×";
  $("zoomFrom").value = f[0].scale;
  $("zoomTo").value = f[1].scale;
  paintFrameBox();
};
let zoomSliderBefore = null;
$("visualZoom").oninput = () => {
  const scope = sequenceScope();
  if (!scope) return;
  if (!zoomSliderBefore) zoomSliderBefore = clone(project);
  const f = sequenceFrames(scope),
    index = endpointIndex(),
    value = Number($("visualZoom").value);
  f.forEach((k, i) => {
    if (index === 0 ? i === 0 || i === 3 : i === 1 || i === 2) k.scale = value;
  });
  saveSequenceFrames(scope, f, false);
  zoomOutput.textContent = value.toFixed(2) + "×";
  focusMotionEndpoint();
  draw();
};
$("visualZoom").onchange = () => {
  if (zoomSliderBefore) {
    history.push(JSON.stringify(zoomSliderBefore));
    future = [];
    zoomSliderBefore = null;
  }
  changed();
};
function changeFrame(e, mode) {
  if (!frameEditing || e.button !== 0) return;
  const scope = sequenceScope();
  if (!scope) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  pause();
  const before = clone(project),
    frames = sequenceFrames(scope),
    index = endpointIndex(),
    initial = frames[index],
    r = previewRect(),
    x = e.clientX,
    y = e.clientY;
  const update = (ev) => {
    const k = { ...initial };
    if (mode === "resize") {
      const oldW = r.width / initial.scale,
        oldH = r.height / initial.scale;
      k.scale = Math.max(
        1,
        Math.min(
          20,
          Math.min(
            r.width / Math.max(r.width / 20, oldW + ev.clientX - x),
            r.height / Math.max(r.height / 20, oldH + ev.clientY - y),
          ),
        ),
      );
    } else if (mode === "move") {
      k.x = Math.max(
        0,
        Math.min(
          1,
          initial.x +
            (ev.clientX - x) / Math.max(1, r.width - r.width / initial.scale),
        ),
      );
      k.y = Math.max(
        0,
        Math.min(
          1,
          initial.y +
            (ev.clientY - y) / Math.max(1, r.height - r.height / initial.scale),
        ),
      );
    } else {
      k.x = Math.max(
        0,
        Math.min(
          1,
          ((ev.clientX - r.left) / r.width - 0.5 / k.scale) /
            Math.max(0.0001, 1 - 1 / k.scale),
        ),
      );
      k.y = Math.max(
        0,
        Math.min(
          1,
          ((ev.clientY - r.top) / r.height - 0.5 / k.scale) /
            Math.max(0.0001, 1 - 1 / k.scale),
        ),
      );
    }
    const next = frames.map((f, i) =>
      (index === 0 ? i === 0 || i === 3 : i === 1 || i === 2)
        ? { ...f, scale: k.scale, x: k.x, y: k.y }
        : f,
    );
    saveSequenceFrames(scope, next, false);
    $("visualZoom").value = k.scale;
    zoomOutput.textContent = k.scale.toFixed(2) + "×";
    draw();
  };
  captureMove(e, update, (ev) => {
    if (ev.type === "pointercancel") project = before;
    else {
      update(ev);
      history.push(JSON.stringify(before));
      future = [];
    }
    changed();
  });
}
frameBox.onpointerdown = (e) =>
  changeFrame(e, e.target === frameHandle ? "resize" : "move");
$("previewCanvas").addEventListener(
  "pointerdown",
  (e) => {
    if (frameEditing) changeFrame(e, "pick");
  },
  true,
);
// While framing, show the complete source and a movable crop rectangle, with a live result beside it.
const resultCanvas = el("canvas", "zoom-result");
resultCanvas.width = 320;
resultCanvas.height = 180;
resultCanvas.hidden = true;
$("previewSurface").append(resultCanvas);
const sceneDrawBefore41 = Scene.draw;
Scene.draw = function (ctx, c, m, source, t, W, H) {
  if (
    frameEditing &&
    ctx.canvas === $("previewCanvas") &&
    ["video", "image"].includes(m.kind) &&
    sequenceScope()?.members.some((x) => x.id === c.id)
  ) {
    const scope = sequenceScope(),
      k = sequenceFrames(scope)[endpointIndex()];
    sceneDrawBefore41.call(
      Scene,
      ctx,
      { ...c, zoom: undefined },
      m,
      source,
      t,
      W,
      H,
    );
    const z = { from: k.scale, to: k.scale, x: k.x, y: k.y };
    const result = resultCanvas.getContext("2d");
    result.clearRect(0, 0, 320, 180);
    sceneDrawBefore41.call(
      Scene,
      result,
      { ...c, zoom: z },
      m,
      source,
      t,
      320,
      180,
    );
    resultCanvas.hidden = false;
  } else sceneDrawBefore41.call(Scene, ctx, c, m, source, t, W, H);
};
const oldPaintFrame = paintFrameBox;
paintFrameBox = function () {
  oldPaintFrame();
  resultCanvas.hidden = !frameEditing || !sequenceScope();
};
function sequenceApplicationBars(scope, node) {
  const owner = sequenceOwner(scope),
    apps = new Map();
  for (const c of scope.members)
    for (const a of c.attachments || []) {
      const key = a.applicationId || a.id;
      if (!apps.has(key)) apps.set(key, []);
      apps.get(key).push({ c, a });
    }
  const hasZoom = !!owner.zoom?.keys?.length;
  const hasNoise = scope.members.some((c) => c.voice?.noise > 0);
  const inlineEffects = new Map();
  for (const c of scope.members)
    if (c.effect && c.effect.type !== "none") {
      const key = JSON.stringify(c.effect);
      if (!inlineEffects.has(key)) inlineEffects.set(key, []);
      inlineEffects.get(key).push(c);
    }
  if (!apps.size && !hasZoom && !hasNoise && !inlineEffects.size) return;
  const toggle = el(
    "button",
    "expand-clip",
    expandedClips.has(owner.id) ? "▾" : "▸",
  );
  toggle.onpointerdown = (e) => e.stopPropagation();
  toggle.onclick = (e) => {
    e.stopPropagation();
    expandedClips.has(owner.id)
      ? expandedClips.delete(owner.id)
      : expandedClips.add(owner.id);
    renderTimeline();
  };
  node.append(toggle);
  if (!expandedClips.has(owner.id)) return;
  const list = el("div", "sequence-bars");
  Object.assign(list.style, {
    left: scope.start * scale + "px",
    width: (scope.end - scope.start) * scale + "px",
    top: "36px",
  });
  $("track" + scope.track).append(list);
  const add = (entries, zoom) => {
    const a = entries?.[0]?.a,
      frames = hasZoom ? sequenceFrames(scope) : null;
    const timing = hasZoom ? zoomDurations(scope) : null;
    const start = zoom
      ? frames[0].time
      : Math.min(
          ...entries.map(
            ({ c, a }) =>
              c.start - scope.start + (a.sourceIn - c.in) / (c.speed || 1),
          ),
        );
    const end = zoom
      ? frames.at(-1).time
      : Math.max(
          ...entries.map(
            ({ c, a }) =>
              c.start - scope.start + (a.sourceOut - c.in) / (c.speed || 1),
          ),
        );
    const row = el("div", "attachment-row"),
      bar = el(
        "div",
        "attachment-bar" + (zoom ? " zoom-motion" : ""),
        zoom
          ? "↗ Inquadratura ↘"
          : project.media.find((m) => m.id === a.mediaId)?.name || "Elemento",
      );
    row.append(bar);
    list.append(row);
    const paint = (lo, hi) => {
      bar.style.left = (lo / (scope.end - scope.start)) * 100 + "%";
      bar.style.width = ((hi - lo) / (scope.end - scope.start)) * 100 + "%";
    };
    paint(Math.max(0, start), Math.min(scope.end - scope.start, end));
    function resize(e, side) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const before = clone(project),
        x = e.clientX;
      if (!zoom) {
        selection = new Set(entries.map((x) => x.a.id));
        previewFocus = a.id;
        properties();
      }
      const move = (ev) => {
        const delta = (ev.clientX - x) / scale;
        let lo = start,
          hi = end;
        if (side === "left")
          lo = Math.max(0, Math.min(end - 0.02, start + delta));
        else if (side === "right")
          hi = Math.min(
            scope.end - scope.start,
            Math.max(start + 0.02, end + delta),
          );
        else {
          const shift = Math.max(
            -start,
            Math.min(scope.end - scope.start - end, delta),
          );
          lo += shift;
          hi += shift;
        }
        if (zoom)
          saveSequenceFrames(
            scope,
            Timeline.zoomEnvelope(frames, lo, hi, timing.entry, timing.exit),
            false,
            timing,
          );
        else
          for (const { c, a } of entries) {
            a.sourceIn = c.in + (scope.start + lo - c.start) * (c.speed || 1);
            a.sourceOut = c.in + (scope.start + hi - c.start) * (c.speed || 1);
          }
        paint(lo, hi);
        draw();
      };
      captureMove(e, move, (ev) => {
        if (ev.type === "pointercancel") project = before;
        else {
          move(ev);
          history.push(JSON.stringify(before));
          future = [];
        }
        changed();
      });
    }
    bar.onpointerdown = (e) => resize(e, "move");
    for (const side of ["left", "right"]) {
      const h = el("span", "interval-handle " + side);
      h.onpointerdown = (e) => resize(e, side);
      bar.append(h);
    }
    bar.oncontextmenu = (e) =>
      showTimelineEffectMenu(
        e,
        zoom ? "Elimina zoom" : "Elimina effetto",
        () => {
          if (zoom) return removeSequenceZoom(scope);
          pause();
          checkpoint();
          for (const { c, a } of entries)
            c.attachments = c.attachments.filter((x) => x.id !== a.id);
          selection = new Set([owner.id]);
          changed();
        },
      );
  };
  for (const entries of apps.values()) add(entries, false);
  if (hasZoom) add(null, true);
  const staticBar = (label, kind, clips, remove) => {
    const row = el("div", "attachment-row"),
      bar = el("div", "attachment-bar " + kind, label);
    const lo = Math.min(...clips.map((c) => c.start)) - scope.start,
      hi =
        Math.max(...clips.map((c) => c.start + Timeline.duration(c))) -
        scope.start;
    bar.style.left = (lo / (scope.end - scope.start)) * 100 + "%";
    bar.style.width = ((hi - lo) / (scope.end - scope.start)) * 100 + "%";
    row.append(bar);
    list.append(row);
    bar.title = label + " · tasto destro per eliminare";
    bar.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      pause();
      selection = new Set(clips.map((c) => c.id));
      previewFocus = clips[0].id;
      properties();
      draw();
    };
    bar.oncontextmenu = (e) =>
      showTimelineEffectMenu(e, "Elimina effetto", () => {
        pause();
        checkpoint();
        remove();
        selection = new Set([owner.id]);
        changed();
      });
  };
  if (hasNoise)
    staticBar(
      "Riduzione del rumore · DeepFilterNet3",
      "noise-effect",
      scope.members.filter((c) => c.voice?.noise > 0),
      () => {
        for (const c of scope.members) if (c.voice) c.voice.noise = 0;
      },
    );
  for (const clips of inlineEffects.values())
    staticBar(
      clips[0].effect.type === "blur" ? "Sfocatura" : "Pixelizzazione",
      "inline-effect",
      clips,
      () => clips.forEach((c) => delete c.effect),
    );
  const height = Math.max(
    project.trackHeights[scope.track],
    44 +
      (apps.size +
        (hasZoom ? 1 : 0) +
        (hasNoise ? 1 : 0) +
        inlineEffects.size) *
        15,
  );
  $("track" + scope.track).style.height = height + "px";
  document.querySelector(`[data-choose-track="${scope.track}"]`).style.height =
    height + "px";
}
const timelineBefore41 = renderTimeline;
renderTimeline = function () {
  timelineBefore41();
  document
    .querySelectorAll(".attachment-list,.expand-clip,.sequence-bars")
    .forEach((n) => n.remove());
  const done = new Set();
  for (const node of document.querySelectorAll(".clip[data-id]")) {
    const c = project.clips.find((c) => c.id === node.dataset.id);
    if (!c || c.linkId) continue;
    const scope = sequenceScope(c),
      owner = sequenceOwner(scope);
    if (!done.has(owner.id)) {
      done.add(owner.id);
      sequenceApplicationBars(scope, node);
    }
  }
};
window.addEventListener("resize", () => {
  paintFrameBox();
});
properties();
renderTimeline();
let trackBaseSignature = "";
function alignTimelineBase() {
  const sc = $("timelineScroll"),
    timeline = $("timeline");
  const rows = [...timeline.querySelectorAll(".track")];
  const total = rows.reduce(
    (n, row) => n + row.getBoundingClientRect().height,
    0,
  );
  const ruler = $("ruler").getBoundingClientRect().height;
  const gap = Math.max(0, sc.clientHeight - ruler - total);
  let spacer = timeline.querySelector(".timeline-base-spacer");
  if (!spacer) {
    spacer = el("div", "timeline-base-spacer");
    $("ruler").after(spacer);
  }
  spacer.style.height = gap + "px";
  let labelSpacer = $("labelRows").querySelector(".timeline-base-spacer");
  if (!labelSpacer) {
    labelSpacer = el("div", "timeline-base-spacer");
    $("labelRows").prepend(labelSpacer);
  }
  labelSpacer.style.height = gap + "px";
  const signature = [total, sc.clientHeight, rows.length].join(":");
  if (signature !== trackBaseSignature) {
    trackBaseSignature = signature;
    sc.scrollTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
  }
  $("labelRows").style.transform = `translateY(${-sc.scrollTop}px)`;
  for (const row of rows) {
    if (row.querySelector(".lane-resizer")) continue;
    const label = document.querySelector(
        `[data-choose-track="${row.dataset.track}"]`,
      ),
      h = el("div", "lane-resizer");
    h.title = "Trascina verso l’alto per aumentare l’altezza";
    h.onpointerdown = (e) =>
      label.querySelector(".track-resizer").onpointerdown(e);
    row.append(h);
  }
}
const timelineWithBars41 = renderTimeline;
renderTimeline = function () {
  timelineWithBars41();
  alignTimelineBase();
};
const geometryBefore41 = applyTrackGeometry;
applyTrackGeometry = function () {
  geometryBefore41();
  alignTimelineBase();
};
window.addEventListener("resize", alignTimelineBase);
renderTimeline();
for (const [id, type] of [
  ["addText", "text"],
  ["addArrow", "arrow"],
  ["addCircle", "circle"],
  ["addBlur", "blur"],
  ["addPixel", "pixel"],
]) {
  const button = $(id),
    previous = button.onclick;
  button.title =
    "Trascina sopra una clip per collegarlo, oppure nella timeline per una nuova traccia";
  button.onclick = (e) => {
    const scope = sequenceScope();
    if (scope?.members.length > 1) attachElement(sequenceOwner(scope), type);
    else previous?.call(button, e);
  };
}

function showTimelineEffectMenu(e, label, remove) {
  e.preventDefault();
  e.stopPropagation();
  $("contextMenu").hidden = $("trackContextMenu").hidden = true;
  const menu = $("effectContextMenu"),
    button = $("deleteTimelineEffect");
  button.textContent = label;
  button.onclick = () => {
    menu.hidden = true;
    remove();
  };
  menu.hidden = false;
  menu.style.left =
    Math.max(4, Math.min(e.clientX, innerWidth - menu.offsetWidth - 4)) + "px";
  menu.style.top =
    Math.max(4, Math.min(e.clientY, innerHeight - menu.offsetHeight - 4)) +
    "px";
  button.focus({ preventScroll: true });
}
window.addEventListener("pointerdown", (e) => {
  if (!$("effectContextMenu").contains(e.target))
    $("effectContextMenu").hidden = true;
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("effectContextMenu").hidden = true;
});
function applyZoomFromGallery(scope = sequenceScope()) {
  if (
    !scope ||
    !scope.members.some((c) => ["video", "image"].includes(mediaOf(c).kind))
  )
    return toast(
      "Seleziona una clip video o un’immagine per applicare lo zoom",
    );
  selection = new Set(scope.members.map((c) => c.id));
  previewFocus = sequenceOwner(scope).id;
  if (!sequenceOwner(scope).zoom?.keys?.length)
    saveSequenceFrames(scope, sequenceFrames(scope), true, {
      entry: 2,
      exit: 2,
    });
  expandedClips.add(sequenceOwner(scope).id);
  $("layoutPanel").open = true;
  changed();
  if (!frameEditing) $("pickZoomFrame").click();
}
function applyDenoiseFromGallery(scope = sequenceScope()) {
  const clips =
    scope?.members.filter((c) => mediaOf(c).hasAudio && !c.audioDetached) || [];
  if (!clips.length)
    return toast("Seleziona una clip con audio per applicare DeepFilterNet3");
  pause();
  checkpoint();
  for (const c of clips)
    c.voice = {
      noise: 0,
      level: 0,
      ...c.voice,
      noise: c.voice?.noise || 0.5,
      bypass: false,
    };
  expandedClips.add(sequenceOwner(scope).id);
  selection = new Set(clips.map((c) => c.id));
  previewFocus = clips[0].id;
  $("voiceNoise").closest("details").open = true;
  changed();
}
for (const [id, type, apply] of [
  ["addZoom", "zoom", applyZoomFromGallery],
  ["addDenoise", "denoise", applyDenoiseFromGallery],
]) {
  const button = $(id);
  button.onclick = () => apply();
  button.draggable = true;
  button.title = "Applica alla clip selezionata o trascina sopra una clip";
  button.ondragstart = (e) => {
    draggedElement = type;
    e.dataTransfer.setData("application/akhbar-element", type);
    e.dataTransfer.effectAllowed = "copy";
  };
  button.ondragend = () => {
    draggedElement = null;
    document
      .querySelectorAll(".drop-ghost,.attach-target")
      .forEach((n) =>
        n.classList.contains("drop-ghost")
          ? n.remove()
          : n.classList.remove("attach-target"),
      );
  };
}
