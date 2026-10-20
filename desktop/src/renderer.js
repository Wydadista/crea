"use strict";
const $ = (id) => document.getElementById(id),
  uid = () => crypto.randomUUID(),
  clone = (x) => JSON.parse(JSON.stringify(x));
let project = Timeline.empty(),
  selection = new Set(),
  time = 0,
  scale = 40,
  playing = false,
  lastTick = 0,
  frame,
  history = [],
  future = [],
  exportBusy = false,
  exportCancelled = false;
const players = new Map(),
  waves = new Map();
let waveQueue = Promise.resolve(),
  toastTimer,
  waveEpoch = 0;
let keys = { split: "s", play: " ", delete: "Delete" };
try {
  keys = { ...keys, ...JSON.parse(localStorage.getItem("crea-keys") || "{}") };
} catch {}
const mediaOf = (c) => project.media.find((m) => m.id === c.mediaId),
  selected = () => project.clips.filter((c) => selection.has(c.id)),
  first = () => selected()[0];
const fmt = (t) => {
  t = Math.max(0, t || 0);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}.${String(Math.floor((t % 1) * 100)).padStart(2, "0")}`;
};
function toast(s) {
  $("status").textContent = s;
  $("toast").textContent = s;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5500);
}
const safe =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      toast(e.message || String(e));
    }
  };
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function checkpoint() {
  history.push(JSON.stringify(project));
  if (history.length > 80) history.shift();
  future = [];
}
function resetPlayers() {
  for (const p of players.values()) {
    p.element.pause?.();
    p.element.removeAttribute?.("src");
    p.element.load?.();
  }
  players.clear();
}
function undo(from, to) {
  if (!from.length) return;
  pause();
  to.push(JSON.stringify(project));
  project = JSON.parse(from.pop());
  selection.clear();
  resetPlayers();
  time = Math.min(time, Timeline.total(project.clips));
  render();
}
function render() {
  renderLibrary();
  renderTimeline();
  properties();
  syncPlayers(true);
  draw();
  $("undoBtn").disabled = !history.length;
  $("redoBtn").disabled = !future.length;
}
function changed() {
  time = Math.min(time, Timeline.total(project.clips));
  renderTimeline();
  properties();
  syncPlayers(true);
  draw();
  $("undoBtn").disabled = !history.length;
  $("redoBtn").disabled = !future.length;
}
function groupMembers(ids) {
  const groups = new Set(
    project.clips
      .filter((c) => ids.includes(c.id))
      .map((c) => c.groupId)
      .filter(Boolean),
  );
  return project.clips
    .filter((c) => ids.includes(c.id) || groups.has(c.groupId))
    .map((c) => c.id);
}
function selectIds(ids, add = false, toggle = false) {
  ids = groupMembers(ids);
  if (!add) selection.clear();
  const remove = toggle && ids.every((id) => selection.has(id));
  for (const id of ids) remove ? selection.delete(id) : selection.add(id);
  renderTimeline();
  properties();
  draw();
}
function requestWave(m) {
  if (!m.hasAudio || waves.has(m.id)) return;
  waves.set(m.id, { pending: true });
  const epoch = waveEpoch;
  waveQueue = waveQueue.then(async () => {
    if (epoch !== waveEpoch) return;
    try {
      const wave = await studio.waveform(m.path);
      if (epoch !== waveEpoch) return;
      let max = 0;
      for (const peak of wave.peaks) max = Math.max(max, peak);
      wave.max = max || 1;
      waves.set(m.id, wave);
    } catch (e) {
      waves.set(m.id, { error: e.message });
      toast("Forma d’onda non disponibile per " + m.name + ": " + e.message);
    }
    renderTimeline();
  });
}
function renderLibrary() {
  const list = $("mediaList");
  list.replaceChildren();
  const actual = project.media.filter((m) => m.kind !== "annotation");
  $("mediaCount").textContent = actual.length;
  $("libraryEmpty").hidden = !!actual.length;
  for (const m of actual) {
    const card = el("div", "media-card");
    card.draggable = true;
    card.append(
      el(
        "span",
        "media-icon",
        m.kind === "audio" ? "♫" : m.kind === "image" ? "▧" : "▷",
      ),
    );
    const text = el("div");
    text.append(
      el("strong", "", m.name),
      el("small", "", `${m.kind.toUpperCase()} · ${fmt(m.duration)}`),
    );
    card.append(text);
    const add = el("button", "", "＋");
    add.title = "Aggiungi al cursore, sulla traccia scelta";
    add.onclick = () => addMedia(m.id, time, Number($("activeTrack").value));
    card.append(add);
    card.ondragstart = (e) => {
      e.dataTransfer.setData("application/crea-media", m.id);
    };
    card.ondblclick = () =>
      addMedia(m.id, time, Number($("activeTrack").value));
    list.append(card);
  }
}
async function imported(result) {
  if (result.media.length) {
    checkpoint();
    project.media.push(...result.media);
    renderLibrary();
    for (const m of result.media) requestWave(m);
    toast(
      `${result.media.length} file importati. Analisi dell’audio in corso.`,
    );
  }
  if (result.errors.length) toast(result.errors.join("\n"));
}
$("importBtn").onclick = safe(async () => imported(await studio.importMedia()));
function focusNode(id) {
  const node = [...document.querySelectorAll(".clip")].find(
    (n) => n.dataset.id === id,
  );
  node?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function addMedia(id, start, track) {
  const m = project.media.find((m) => m.id === id);
  if (!m) return;
  pause();
  checkpoint();
  const c = {
    id: uid(),
    mediaId: id,
    start: Math.max(0, start),
    track,
    in: 0,
    out: m.duration,
    speed: 1,
    volume: 1,
  };
  project.clips.push(c);
  selection = new Set([c.id]);
  changed();
  focusNode(c.id);
  return c;
}
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener(
  "drop",
  safe(async (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length)
      await imported(
        await studio.importPaths(
          [...e.dataTransfer.files]
            .map((f) => studio.filePath(f))
            .filter(Boolean),
        ),
      );
  }),
);
function annotation(type) {
  pause();
  checkpoint();
  const m = {
    id: uid(),
    name:
      type === "text"
        ? "Testo"
        : type === "arrow"
          ? "Freccia rossa"
          : "Cerchio",
    kind: "annotation",
    duration: 5,
    hasAudio: false,
  };
  project.media.push(m);
  const c = {
    id: uid(),
    mediaId: m.id,
    start: time,
    track: Number($("activeTrack").value),
    in: 0,
    out: 5,
    speed: 1,
    volume: 0,
    annotation: {
      type,
      text: "Il tuo testo",
      font: "Arial",
      size: 64,
      color: type === "text" ? "#ffffff" : "#ff3535",
      background: "#15191f",
      backgroundEnabled: false,
      x: type === "arrow" ? 35 : 50,
      y: 50,
      length: type === "circle" ? 30 : 25,
      angle: 0,
      lineWidth: 10,
      animate: type === "circle" ? 0.8 : 0,
    },
  };
  project.clips.push(c);
  selection = new Set([c.id]);
  changed();
  focusNode(c.id);
}
$("addText").onclick = () => annotation("text");
$("addArrow").onclick = () => annotation("arrow");
$("addCircle").onclick = () => annotation("circle");
function renderTimeline() {
  const sc = $("timelineScroll"),
    total = Timeline.total(project.clips);
  $("timeline").style.width =
    Math.max(sc.clientWidth, (Math.max(total, time) + 20) * scale) + "px";
  const ruler = $("ruler");
  ruler.replaceChildren();
  const step = scale >= 100 ? 1 : scale >= 35 ? 5 : scale >= 15 ? 10 : 30;
  for (
    let t = 0;
    t < parseFloat($("timeline").style.width) / scale;
    t += step
  ) {
    const tick = el("span", "tick", fmt(t).slice(0, 5));
    tick.style.left = t * scale + "px";
    ruler.append(tick);
  }
  for (let track = 0; track < 3; track++) $("track" + track).replaceChildren();
  const blocks = Timeline.groups(project.clips),
    rows = new Map();
  for (let track = 0; track < 3; track++) {
    const ends = [];
    for (const block of blocks
      .filter((b) => b.track === track)
      .sort((a, b) => a.start - b.start)) {
      let lane = ends.findIndex((t) => t <= block.start + 0.00001);
      if (lane < 0) lane = ends.length;
      ends[lane] = block.end;
      rows.set(block.key, lane);
    }
    const height = Math.max(80, ends.length * 70 + 10);
    $("track" + track).style.height = height + "px";
    document.querySelector('[data-choose-track="' + track + '"]').style.height =
      height + "px";
  }
  for (const block of blocks) {
    const members = block.members,
      c = members[0],
      m = mediaOf(c),
      group = !!block.groupId,
      node = el(
        "div",
        `clip${group ? " group" : ""}${m.kind === "audio" ? " audio" : ""}${m.kind === "annotation" ? " annotation" : ""}${members.some((c) => selection.has(c.id)) ? " selected" : ""}`,
      );
    node.style.top = 10 + (rows.get(block.key) || 0) * 70 + "px";
    node.dataset.id = c.id;
    node.dataset.group = block.groupId || "";
    node.style.left = block.start * scale + "px";
    node.style.width = Math.max(5, (block.end - block.start) * scale) + "px";
    node.title = group
      ? `Gruppo modificabile · ${members.length} clip`
      : m.name;
    node.append(
      el(
        "span",
        "clip-name",
        group
          ? `▣ Gruppo · ${members.length} clip`
          : m.kind === "annotation"
            ? c.annotation.type === "text"
              ? "T " + c.annotation.text
              : m.name
            : m.name,
      ),
      el("span", "clip-duration", fmt(block.end - block.start)),
    );
    if (members.some((c) => waves.get(c.mediaId)?.pending))
      node.classList.add("wave-pending");
    node.onpointerdown = (e) => beginClipDrag(e, block);
    node.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!members.some((c) => selection.has(c.id)))
        selectIds(members.map((c) => c.id));
      showContext(e.clientX, e.clientY);
    };
    if (!group)
      for (const side of ["left", "right"]) {
        const h = el("span", "handle " + side);
        h.onpointerdown = (e) => trimDrag(e, c, side);
        node.append(h);
      }
    $("track" + block.track).append(node);
    drawWave(node, block);
  }
  $("durationLabel").textContent =
    `${project.clips.length} clip · ${fmt(total)}`;
  $("zoom").value = scale;
  $("zoomLabel").textContent = Math.round(scale) + " px/s";
  updateHead();
}
function drawWave(node, block) {
  const sc = $("timelineScroll"),
    blockLeft = block.start * scale,
    left = Math.max(0, sc.scrollLeft - blockLeft - 10),
    width = Math.max(
      0,
      Math.min((block.end - block.start) * scale - left, sc.clientWidth + 20),
    );
  if (!width || !block.members.some((c) => waves.get(c.mediaId)?.peaks)) return;
  const cv = el("canvas", "waveform");
  cv.width = Math.ceil(width);
  cv.height = 30;
  cv.style.left = left + "px";
  cv.style.width = width + "px";
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#adddd2";
  for (let x = 0; x < cv.width; x++) {
    const t = block.start + (left + x) / scale;
    let peak = 0;
    for (const c of block.members) {
      if (t < c.start || t >= c.start + Timeline.duration(c)) continue;
      const wave = waves.get(c.mediaId);
      if (!wave?.peaks) continue;
      const a = Math.floor(Timeline.sourceTime(c, t) * wave.rate),
        b = Math.min(
          wave.peaks.length,
          Math.max(
            a + 1,
            Math.ceil(
              (Timeline.sourceTime(c, t) + (c.speed || 1) / scale) * wave.rate,
            ),
          ),
        );
      for (let i = Math.max(0, a); i < b; i++)
        peak = Math.max(peak, (wave.peaks[i] * c.volume) / (wave.max || 1));
    }
    if (peak > 0.001) {
      const h = Math.max(1, Math.min(28, peak * 28));
      ctx.fillRect(x, 15 - h / 2, 1, h);
    }
  }
  node.append(cv);
}
$("timelineScroll").onscroll = () => {
  $("labelRows").style.transform =
    `translateY(-${$("timelineScroll").scrollTop}px)`;
  for (const block of Timeline.groups(project.clips)) {
    const node = [...$("track" + block.track).children].find(
      (n) => n.dataset.id === block.members[0].id,
    );
    if (node) {
      node.querySelector("canvas")?.remove();
      drawWave(node, block);
    }
  }
};
function captureMove(e, move, up) {
  document.body.setPointerCapture?.(e.pointerId);
  const finish = (ev) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    try {
      document.body.releasePointerCapture(e.pointerId);
    } catch {}
    up?.(ev);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}
function beginClipDrag(e, block) {
  if (e.button !== 0 || e.target.classList.contains("handle")) return;
  e.preventDefault();
  e.stopPropagation();
  pause();
  const ids = block.members.map((c) => c.id);
  if (e.ctrlKey || e.shiftKey) selectIds(ids, true, true);
  else if (!ids.some((id) => selection.has(id))) selectIds(ids);
  if (!selection.size) return;
  const origin = selected().map((c) => ({ c, start: c.start, track: c.track })),
    x = e.clientX,
    y = e.clientY,
    scroll = $("timelineScroll").scrollLeft,
    trackRects = [0, 1, 2].map((track) => ({
      track,
      rect: $("track" + track).getBoundingClientRect(),
    }));
  let moved = false;
  captureMove(
    e,
    (ev) => {
      if (!moved && Math.hypot(ev.clientX - x, ev.clientY - y) < 4) return;
      if (!moved) {
        checkpoint();
        moved = true;
      }
      let delta =
        (ev.clientX - x + $("timelineScroll").scrollLeft - scroll) / scale;
      delta = Math.max(delta, -Math.min(...origin.map((o) => o.start)));
      let td =
        (trackRects.find(
          (r) => ev.clientY >= r.rect.top && ev.clientY < r.rect.bottom,
        )?.track ?? block.track) - block.track;
      td = Math.max(
        -Math.min(...origin.map((o) => o.track)),
        Math.min(2 - Math.max(...origin.map((o) => o.track)), td),
      );
      for (const o of origin) {
        o.c.start = Math.max(0, o.start + delta);
        o.c.track = o.track + td;
      }
      changed();
    },
    () => {
      if (!moved && !e.ctrlKey && !e.shiftKey) selectIds(ids);
    },
  );
}
function trimDrag(e, c, side) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pause();
  selectIds([c.id]);
  const x = e.clientX,
    old = clone(c),
    m = mediaOf(c);
  let dirty = false;
  captureMove(e, (ev) => {
    if (!dirty) {
      checkpoint();
      dirty = true;
    }
    const delta = (ev.clientX - x) / scale,
      rate = c.speed || 1;
    if (side === "left") {
      const newStart = Math.max(
          0,
          Math.min(
            old.start + Timeline.duration(old) - 0.02,
            old.start + delta,
          ),
        ),
        newIn = old.in + (newStart - old.start) * rate;
      c.in = Math.max(0, newIn);
      c.start = old.start + (c.in - old.in) / rate;
    } else
      c.out = Math.max(
        c.in + 0.02 * rate,
        Math.min(
          ["image", "annotation"].includes(m.kind) ? 86400 : m.duration,
          old.out + delta * rate,
        ),
      );
    changed();
  });
}
for (let track = 0; track < 3; track++) {
  const target = $("track" + track);
  target.ondragover = (e) => {
    e.preventDefault();
    target.classList.add("dragover");
  };
  target.ondragleave = () => target.classList.remove("dragover");
  target.ondrop = (e) => {
    e.preventDefault();
    target.classList.remove("dragover");
    const id = e.dataTransfer.getData("application/crea-media");
    if (id) {
      e.stopPropagation();
      addMedia(
        id,
        (e.clientX - target.getBoundingClientRect().left) / scale,
        track,
      );
    }
  };
  target.onpointerdown = (e) => {
    if (e.target !== target || e.button !== 0) return;
    pause();
    $("activeTrack").value = track;
    const x = e.clientX,
      y = e.clientY,
      rect = $("timeline").getBoundingClientRect(),
      t0 = Math.max(0, (x - rect.left) / scale);
    let moved = false;
    const base = e.ctrlKey ? new Set(selection) : new Set();
    captureMove(
      e,
      (ev) => {
        if (Math.hypot(ev.clientX - x, ev.clientY - y) < 5 && !moved) return;
        moved = true;
        const a = Math.min(x, ev.clientX),
          b = Math.max(x, ev.clientX),
          top = Math.min(y, ev.clientY),
          bottom = Math.max(y, ev.clientY);
        selection = new Set(base);
        for (const c of project.clips) {
          const r = $("track" + c.track).getBoundingClientRect(),
            l = rect.left + c.start * scale,
            right = l + Timeline.duration(c) * scale;
          if (right >= a && l <= b && r.bottom >= top && r.top <= bottom)
            groupMembers([c.id]).forEach((id) => selection.add(id));
        }
        renderTimeline();
        properties();
        const mar = $("marquee");
        mar.hidden = false;
        Object.assign(mar.style, {
          left: a - rect.left + "px",
          top: top - rect.top + "px",
          width: b - a + "px",
          height: bottom - top + "px",
        });
      },
      () => {
        $("marquee").hidden = true;
        if (!moved) {
          selection.clear();
          seek(t0);
          properties();
          renderTimeline();
        }
      },
    );
  };
}
for (const n of document.querySelectorAll("[data-choose-track]"))
  n.onclick = () => {
    $("activeTrack").value = n.dataset.chooseTrack;
  };
$("ruler").onpointerdown = (e) => {
  if (e.button !== 0) return;
  pause();
  const move = (ev) =>
    seek((ev.clientX - $("ruler").getBoundingClientRect().left) / scale);
  move(e);
  captureMove(e, move);
};
function setZoom(value) {
  const sc = $("timelineScroll"),
    oldX = time * scale - sc.scrollLeft,
    anchor = oldX >= 0 && oldX <= sc.clientWidth ? oldX : sc.clientWidth / 2;
  scale = Math.max(8, Math.min(320, Number(value)));
  renderTimeline();
  sc.scrollLeft = Math.max(0, time * scale - anchor);
}
$("timelineScroll").addEventListener(
  "wheel",
  (e) => {
    const delta = e.deltaY || e.deltaX;
    if (e.shiftKey) {
      e.preventDefault();
      setZoom(scale * Math.exp(-delta * 0.002));
    } else if (e.ctrlKey) {
      e.preventDefault();
      $("timelineScroll").scrollLeft += delta;
    }
  },
  { passive: false },
);
$("zoom").oninput = (e) => setZoom(e.target.value);
$("zoomIn").onclick = () => setZoom(scale * 1.25);
$("zoomOut").onclick = () => setZoom(scale / 1.25);
function properties() {
  const all = selected(),
    c = all[0],
    m = c && mediaOf(c);
  $("noSelection").hidden = !!c;
  $("clipProperties").hidden = !c;
  $("selectionCount").textContent = all.length ? `${all.length} clip` : "";
  if (!c) return;
  $("selectedName").textContent =
    all.length > 1
      ? `${all.length} clip selezionate (i parametri comuni si applicano a tutte)`
      : m.name;
  for (const [id, value] of Object.entries({
    clipStart: c.start,
    clipTrack: c.track,
    trimIn: c.in,
    trimOut: c.out,
    clipSpeed: c.speed || 1,
    clipVolume: c.volume * 100,
  }))
    $(id).value =
      typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
  $("volumeValue").textContent = Math.round(c.volume * 100) + "%";
  $("trimIn").disabled = all.length > 1;
  $("trimOut").disabled = all.length > 1;
  const annotation = m.kind === "annotation";
  $("annotationPanel").hidden = !annotation;
  $("layoutPanel").hidden = annotation || m.kind === "audio";
  $("effectsPanel").hidden = annotation || m.kind === "audio";
  const l = c.layout || { x: 0, y: 0, width: 100, height: 100 },
    z = c.zoom || { from: 1, to: 1, x: 0.5, y: 0.5 },
    e = c.effect || {
      type: "none",
      strength: 20,
      x: 30,
      y: 30,
      width: 40,
      height: 40,
    };
  for (const [id, val] of Object.entries({
    layoutX: l.x,
    layoutY: l.y,
    layoutW: l.width,
    layoutH: l.height,
    zoomFrom: z.from,
    zoomTo: z.to,
    zoomX: z.x * 100,
    zoomY: z.y * 100,
    effectType: e.type,
    effectStrength: e.strength,
    effectX: e.x,
    effectY: e.y,
    effectW: e.width,
    effectH: e.height,
  }))
    $(id).value = val;
  if (annotation) {
    const a = c.annotation;
    for (const [id, v] of Object.entries({
      annotationText: a.text,
      annotationFont: a.font,
      annotationSize: a.size,
      annotationColor: a.color,
      annotationX: a.x,
      annotationY: a.y,
      annotationLength: a.length,
      annotationLine: a.lineWidth,
      annotationAngle: a.angle,
      annotationAnimate: a.animate,
      annotationBg: a.background,
    }))
      $(id).value = v;
    $("annotationBgEnabled").checked = a.backgroundEnabled;
    $("textField").hidden = a.type !== "text";
    $("fontField").hidden = a.type !== "text";
  }
}
function edit(mutator) {
  if (!selection.size) return;
  pause();
  const before = clone(project);
  try {
    for (const c of selected()) mutator(c);
    Timeline.validate(project);
    history.push(JSON.stringify(before));
    future = [];
    changed();
  } catch (e) {
    project = before;
    toast(e.message);
    properties();
  }
}
$("clipStart").onchange = () => {
  const c = first(),
    delta = Number($("clipStart").value) - c.start;
  edit((c) => {
    c.start += delta;
  });
};
$("clipTrack").onchange = () => {
  const delta = Number($("clipTrack").value) - first().track;
  edit((c) => {
    c.track += delta;
  });
};
for (const id of ["trimIn", "trimOut"])
  $(id).onchange = () =>
    edit((c) => {
      c.in = Number($("trimIn").value);
      c.out = Number($("trimOut").value);
    });
$("clipSpeed").onchange = () =>
  edit((c) => {
    c.speed = Timeline.parseSpeed($("clipSpeed").value);
  });
$("resetSpeed").onclick = () =>
  edit((c) => {
    c.speed = 1;
  });
$("clipVolume").onchange = () =>
  edit((c) => {
    c.volume = Number($("clipVolume").value) / 100;
  });
for (const id of ["layoutX", "layoutY", "layoutW", "layoutH"])
  $(id).onchange = () =>
    edit((c) => {
      c.layout = {
        x: Number($("layoutX").value),
        y: Number($("layoutY").value),
        width: Number($("layoutW").value),
        height: Number($("layoutH").value),
      };
    });
for (const id of ["zoomFrom", "zoomTo", "zoomX", "zoomY"])
  $(id).onchange = () =>
    edit((c) => {
      c.zoom = {
        from: Number($("zoomFrom").value),
        to: Number($("zoomTo").value),
        x: Number($("zoomX").value) / 100,
        y: Number($("zoomY").value) / 100,
      };
    });
for (const id of [
  "effectType",
  "effectStrength",
  "effectX",
  "effectY",
  "effectW",
  "effectH",
])
  $(id).onchange = () =>
    edit((c) => {
      c.effect = {
        type: $("effectType").value,
        strength: Number($("effectStrength").value),
        x: Number($("effectX").value),
        y: Number($("effectY").value),
        width: Number($("effectW").value),
        height: Number($("effectH").value),
      };
    });
for (const id of [
  "annotationText",
  "annotationFont",
  "annotationSize",
  "annotationColor",
  "annotationX",
  "annotationY",
  "annotationLength",
  "annotationLine",
  "annotationAngle",
  "annotationAnimate",
  "annotationBg",
  "annotationBgEnabled",
])
  $(id).onchange = () =>
    edit((c) => {
      if (!c.annotation) return;
      c.annotation = {
        ...c.annotation,
        text: $("annotationText").value,
        font: $("annotationFont").value,
        size: Number($("annotationSize").value),
        color: $("annotationColor").value,
        x: Number($("annotationX").value),
        y: Number($("annotationY").value),
        length: Number($("annotationLength").value),
        lineWidth: Number($("annotationLine").value),
        angle: Number($("annotationAngle").value),
        animate: Number($("annotationAnimate").value),
        background: $("annotationBg").value,
        backgroundEnabled: $("annotationBgEnabled").checked,
      };
    });
function split() {
  if (!selection.size) return toast("Seleziona una clip o un gruppo.");
  pause();
  const before = JSON.stringify(project);
  const ids = selected().map((c) => c.id),
    newIds = [];
  let count = Timeline.split(project.clips, ids, time, () => {
    const id = uid();
    newIds.push(id);
    return id;
  });
  for (const groupId of new Set(
    project.clips
      .filter((c) => ids.includes(c.id))
      .map((c) => c.groupId)
      .filter(Boolean),
  )) {
    const members = project.clips.filter((c) => c.groupId === groupId),
      start = Math.min(...members.map((c) => c.start)),
      end = Math.max(...members.map((c) => c.start + Timeline.duration(c)));
    if (time > start + 0.02 && time < end - 0.02) {
      const rightId = uid();
      for (const c of members)
        if (c.start >= time - 0.000001) c.groupId = rightId;
      count++;
    }
  }
  if (!count)
    return toast("Posiziona la linea verde dentro le clip selezionate.");
  history.push(before);
  future = [];
  selection = new Set(groupMembers([...ids, ...newIds]));
  changed();
}
function remove() {
  if (!selection.size) return;
  pause();
  checkpoint();
  project.clips = project.clips.filter((c) => !selection.has(c.id));
  selection.clear();
  changed();
}
function group() {
  if (selection.size < 2)
    return toast("Seleziona almeno due clip con Ctrl/Shift + clic.");
  editGroup(true);
}
function editGroup(join) {
  pause();
  checkpoint();
  const groupId = uid();
  for (const c of selected())
    if (join) c.groupId = groupId;
    else delete c.groupId;
  changed();
}
$("groupBtn").onclick = group;
$("groupTool").onclick = group;
$("ungroupBtn").onclick = () => editGroup(false);
$("splitBtn").onclick = split;
$("cutTool").onclick = split;
$("deleteBtn").onclick = remove;
$("deleteTool").onclick = remove;
$("undoBtn").onclick = () => undo(history, future);
$("redoBtn").onclick = () => undo(future, history);
function showContext(x, y) {
  const menu = $("contextMenu");
  menu.hidden = false;
  menu.style.left = Math.min(x, innerWidth - 280) + "px";
  menu.style.top = Math.min(y, innerHeight - 220) + "px";
}
for (const button of $("contextMenu").querySelectorAll("button"))
  button.onclick = () => {
    const a = button.dataset.action;
    $("contextMenu").hidden = true;
    if (a === "split") split();
    if (a === "group") group();
    if (a === "ungroup") editGroup(false);
    if (a === "speed")
      edit((c) => {
        c.speed = 1;
      });
    if (a === "delete") remove();
  };
window.addEventListener("pointerdown", (e) => {
  if (!$("contextMenu").contains(e.target)) $("contextMenu").hidden = true;
});
function updateHead() {
  $("playhead").style.left = time * scale + "px";
  $("timecode").textContent =
    fmt(time) + " / " + fmt(Timeline.total(project.clips));
}
function revealHead() {
  const sc = $("timelineScroll"),
    x = time * scale;
  if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 25)
    sc.scrollLeft = Math.max(0, x - 30);
}
function seek(t) {
  const resume = playing;
  pause();
  time = Math.max(0, Math.min(Timeline.total(project.clips), t));
  syncPlayers(true);
  draw();
  updateHead();
  revealHead();
  if (resume) play();
}
function previewTime() {
  const end = Timeline.total(project.clips);
  return end > 0 && time >= end ? end - 0.0001 : time;
}
function syncPlayers(force = false) {
  const pt = previewTime(),
    active = Timeline.active(project.clips, pt),
    ids = new Set(active.map((c) => c.id));
  // Preload only the next media clip per track; keep decoder/memory usage bounded.
  const upcoming = [];
  for (let track = 0; track < 3; track++) {
    const next = project.clips
      .filter(
        (c) =>
          c.track === track &&
          c.start > pt &&
          c.start < pt + 0.75 &&
          mediaOf(c).kind !== "annotation",
      )
      .sort((a, b) => a.start - b.start)[0];
    if (next) upcoming.push(next);
  }
  const keep = new Set([...ids, ...upcoming.map((c) => c.id)]);
  for (const [id, p] of players)
    if (!keep.has(id)) {
      p.element.pause?.();
      p.element.removeAttribute?.("src");
      p.element.load?.();
      players.delete(id);
    }
  for (const c of [...active, ...upcoming]) {
    const m = mediaOf(c);
    if (m.kind === "annotation") continue;
    let p = players.get(c.id);
    if (!p) {
      const element =
        m.kind === "image"
          ? new Image()
          : document.createElement(m.kind === "audio" ? "audio" : "video");
      element.src = m.url;
      element.preload = "auto";
      element.onloadeddata = () => draw();
      element.onload = () => draw();
      element.onerror = () => {
        if (!p.error) {
          p.error = true;
          toast(
            "Anteprima non disponibile per " +
              m.name +
              ". Verifica il codec del file.",
          );
        }
      };
      p = { element, kind: m.kind, error: false };
      players.set(c.id, p);
    }
    if (m.kind === "image") continue;
    const v = p.element,
      at = ids.has(c.id) ? Timeline.sourceTime(c, pt) : c.in;
    v.volume = c.volume;
    v.preservesPitch = true;
    try {
      v.playbackRate = c.speed || 1;
      if (force || Math.abs(v.currentTime - at) > 0.25) v.currentTime = at;
    } catch {}
    if (!ids.has(c.id)) v.pause();
    if (playing && ids.has(c.id) && v.paused && !p.error)
      v.play().catch((e) => {
        if (!["AbortError"].includes(e.name) && !p.error) {
          p.error = true;
          toast("Anteprima: " + e.message);
        }
      });
  }
}
function draw() {
  const cv = $("previewCanvas"),
    ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cv.width, cv.height);
  $("stageEmpty").hidden = project.clips.length > 0;
  const pt = previewTime(),
    active = Timeline.active(project.clips, pt);
  Scene.release(new Set(active.map((c) => c.id)));
  for (const c of active) {
    const m = mediaOf(c),
      p = players.get(c.id);
    if (m.kind === "audio") continue;
    if (m.kind === "annotation")
      Scene.draw(
        ctx,
        c,
        m,
        null,
        Timeline.sourceTime(c, pt),
        cv.width,
        cv.height,
      );
    else if (
      p &&
      (m.kind === "image"
        ? p.element.complete && p.element.naturalWidth
        : p.element.readyState >= 2)
    )
      Scene.draw(
        ctx,
        c,
        m,
        p.element,
        Timeline.sourceTime(c, pt),
        cv.width,
        cv.height,
      );
  }
  const c = first();
  if (
    c &&
    c.effect?.type !== "none" &&
    c.effect &&
    time >= c.start &&
    time < c.start + Timeline.duration(c)
  ) {
    const l = c.layout || { x: 0, y: 0, width: 100, height: 100 },
      e = c.effect;
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = "#b4ed70";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      ((l.x + (e.x * l.width) / 100) * cv.width) / 100,
      ((l.y + (e.y * l.height) / 100) * cv.height) / 100,
      (e.width * l.width * cv.width) / 10000,
      (e.height * l.height * cv.height) / 10000,
    );
    ctx.restore();
  }
}
function pause() {
  playing = false;
  cancelAnimationFrame(frame);
  for (const p of players.values()) p.element.pause?.();
  $("playBtn").textContent = "▶";
}
function play() {
  if (!project.clips.length) return;
  if (time >= Timeline.total(project.clips)) time = 0;
  playing = true;
  lastTick = performance.now();
  $("playBtn").textContent = "Ⅱ";
  syncPlayers(true);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}
function tick(now) {
  if (!playing) return;
  time += (now - lastTick) / 1000;
  lastTick = now;
  if (time >= Timeline.total(project.clips)) {
    time = Timeline.total(project.clips);
    pause();
  }
  syncPlayers();
  draw();
  updateHead();
  if (playing) {
    revealHead();
    frame = requestAnimationFrame(tick);
  }
}
$("playBtn").onclick = () => (playing ? pause() : play());
$("toStart").onclick = () => seek(0);
$("toEnd").onclick = () => seek(Timeline.total(project.clips));
$("previewCanvas").onpointerdown = (e) => {
  const c = first();
  if (!c || e.button !== 0) return;
  pause();
  const cv = $("previewCanvas"),
    r = cv.getBoundingClientRect(),
    k = Math.min(r.width / cv.width, r.height / cv.height),
    x = e.clientX,
    y = e.clientY,
    old = clone(c);
  let dirty = false;
  captureMove(e, (ev) => {
    if (!dirty) {
      checkpoint();
      dirty = true;
    }
    const px = ((ev.clientX - x) / (cv.width * k)) * 100,
      py = ((ev.clientY - y) / (cv.height * k)) * 100;
    if (c.annotation) {
      c.annotation.x = Math.max(0, Math.min(100, old.annotation.x + px));
      c.annotation.y = Math.max(0, Math.min(100, old.annotation.y + py));
    } else if (c.effect && c.effect.type !== "none") {
      const l = c.layout || { width: 100, height: 100 };
      c.effect.x = Math.max(
        0,
        Math.min(100 - c.effect.width, old.effect.x + (px * 100) / l.width),
      );
      c.effect.y = Math.max(
        0,
        Math.min(100 - c.effect.height, old.effect.y + (py * 100) / l.height),
      );
    } else if (mediaOf(c).kind !== "audio") {
      c.layout = {
        ...(old.layout || { x: 0, y: 0, width: 100, height: 100 }),
        x: Math.max(-100, Math.min(100, (old.layout?.x || 0) + px)),
        y: Math.max(-100, Math.min(100, (old.layout?.y || 0) + py)),
      };
    }
    properties();
    draw();
  });
};
$("saveProject").onclick = safe(async () => {
  if (await studio.saveProject(project))
    toast("Progetto salvato. Conserva anche i file originali.");
});
$("openProject").onclick = safe(async () => {
  if (
    project.clips.length &&
    !confirm("Aprire il progetto e sostituire il montaggio non salvato?")
  )
    return;
  const result = await studio.openProject();
  if (!result) return;
  pause();
  project = Timeline.validate(result);
  waveEpoch++;
  waves.clear();
  waveQueue = Promise.resolve();
  selection.clear();
  time = 0;
  history = [];
  future = [];
  resetPlayers();
  render();
  for (const m of project.media) requestWave(m);
  toast("Progetto aperto.");
});
const keyName = (k) =>
  k === " " ? "Spazio" : k === "Delete" ? "Canc" : k.toUpperCase();
function showKeys() {
  for (const name of ["split", "play", "delete"])
    $("key" + name[0].toUpperCase() + name.slice(1)).value = keyName(
      keys[name],
    );
}
$("keysBtn").onclick = () => {
  showKeys();
  $("keysDialog").showModal();
};
for (const name of ["split", "play", "delete"])
  $("key" + name[0].toUpperCase() + name.slice(1)).onkeydown = (e) => {
    e.preventDefault();
    if (
      e.ctrlKey ||
      e.altKey ||
      e.metaKey ||
      ["Tab", "Escape", "Enter", "Shift", "Control", "Alt", "Meta"].includes(
        e.key,
      )
    )
      return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (Object.entries(keys).some(([n, k]) => n !== name && k === key))
      return toast("Tasto già assegnato");
    keys[name] = key;
    localStorage.setItem("crea-keys", JSON.stringify(keys));
    showKeys();
  };
$("resetKeys").onclick = () => {
  keys = { split: "s", play: " ", delete: "Delete" };
  localStorage.setItem("crea-keys", JSON.stringify(keys));
  showKeys();
};
document.onkeydown = (e) => {
  if (
    document.querySelector("dialog[open]") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    e.target.isContentEditable
  )
    return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey || e.metaKey) {
    if (k === "z") {
      e.preventDefault();
      undo(e.shiftKey ? future : history, e.shiftKey ? history : future);
    }
    if (k === "s") {
      e.preventDefault();
      $("saveProject").click();
    }
    if (k === "a") {
      e.preventDefault();
      selection = new Set(project.clips.map((c) => c.id));
      renderTimeline();
      properties();
    }
    if (k === "g") {
      e.preventDefault();
      e.shiftKey ? editGroup(false) : group();
    }
    return;
  }
  if (e.altKey) return;
  if (k === keys.split) {
    e.preventDefault();
    split();
  }
  if (k === keys.play) {
    e.preventDefault();
    playing ? pause() : play();
  }
  if (k === keys.delete) {
    e.preventDefault();
    remove();
  }
};
async function exportProject(settings) {
  const output = clone(project);
  output.rasters = {};
  const H = Number(settings.height),
    W = Math.round((H * 16) / 9 / 2) * 2;
  for (const c of output.clips) {
    if (mediaOf(c).kind !== "annotation") continue;
    await document.fonts.load(
      `${c.annotation.size}px "${c.annotation.font.replace(/["\\]/g, "")}"`,
    );
    const fps = Math.min(60, Number(settings.fps)),
      duration = c.annotation.type === "circle" ? c.annotation.animate : 0,
      count = duration ? Math.ceil(duration * fps) + 1 : 1,
      frames = [];
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    for (let i = 0; i < count; i++) {
      if (exportCancelled) throw Error("Esportazione annullata");
      if (i % 4 === 0) await new Promise(requestAnimationFrame);
      ctx.clearRect(0, 0, W, H);
      Scene.annotation(ctx, c.annotation, i / fps, W, H);
      frames.push(cv.toDataURL("image/png"));
    }
    output.rasters[c.id] = { fps, frames };
  }
  return output;
}
$("exportBtn").onclick = () => {
  if (!project.clips.length) return toast("Aggiungi una clip.");
  pause();
  $("exportDialog").showModal();
};
$("exportQuality").oninput = () => {
  $("exportQualityValue").textContent = $("exportQuality").value + "%";
};
studio.onProgress((p) => {
  $("exportProgress").value = p.percent;
  $("exportStatus").textContent = p.message;
});
$("exportDialog").oncancel = (e) => {
  if (exportBusy) e.preventDefault();
};
$("exportDialog").onsubmit = (e) => {
  if (exportBusy) e.preventDefault();
};
$("doExport").onclick = safe(async () => {
  if (!$("exportFps").checkValidity())
    return toast("Inserisci FPS interi tra 1 e 120.");
  exportBusy = true;
  exportCancelled = false;
  $("doExport").disabled = true;
  $("cancelExport").hidden = false;
  $("exportProgress").value = 0;
  try {
    const s = {
      height: Number($("exportHeight").value),
      fps: Number($("exportFps").value),
      quality: Number($("exportQuality").value),
    };
    $("exportStatus").textContent = "Preparazione testi e indicatori…";
    const out = await exportProject(s);
    if (exportCancelled) throw Error("Esportazione annullata");
    const result = await studio.exportVideo(out, s);
    $("exportStatus").textContent = result
      ? "Salvato in " + result
      : "Esportazione annullata";
    if (result) toast("Video MP4 esportato.");
  } catch (e) {
    $("exportStatus").textContent = e.message;
  } finally {
    exportBusy = false;
    $("doExport").disabled = false;
    $("cancelExport").hidden = true;
  }
});
$("cancelExport").onclick = () => {
  exportCancelled = true;
  studio.cancelExport();
};
let recorder = null,
  captureStreams = [],
  audioContext = null,
  finishing = false,
  recordTimer,
  startTime;
function stopCapture() {
  for (const s of captureStreams) s.getTracks().forEach((t) => t.stop());
  captureStreams = [];
  audioContext?.close();
  audioContext = null;
  clearInterval(recordTimer);
  $("recordingBar").hidden = true;
  recorder = null;
}
async function microphones(ask = false) {
  let permission;
  if (ask)
    permission = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  try {
    const previous = $("microphoneDevice").value,
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audioinput",
      );
    $("microphoneDevice").replaceChildren();
    const def = el("option", "", "Predefinito del sistema");
    def.value = "default";
    $("microphoneDevice").append(def);
    for (const [i, d] of devices.entries()) {
      const o = el("option", "", d.label || `Microfono ${i + 1}`);
      o.value = d.deviceId;
      $("microphoneDevice").append(o);
    }
    if ([...$("microphoneDevice").options].some((o) => o.value === previous))
      $("microphoneDevice").value = previous;
  } finally {
    permission?.getTracks().forEach((t) => t.stop());
  }
}
$("refreshMicrophones").onclick = safe(() => microphones(true));
$("recordQuality").oninput = () => {
  $("recordQualityValue").textContent = $("recordQuality").value + "%";
};
async function showRecording() {
  if (recorder || finishing)
    return toast("Registrazione o salvataggio in corso.");
  const sources = await studio.sources();
  if (!sources.length) return toast("Nessuno schermo disponibile.");
  $("captureSource").replaceChildren();
  for (const s of sources) {
    const o = el("option", "", s.name);
    o.value = s.id;
    $("captureSource").append(o);
  }
  const windows = (await studio.platform()) === "win32";
  $("systemAudio").disabled = !windows;
  if (!windows) $("systemAudio").checked = false;
  await microphones();
  $("recordDialog").showModal();
}
$("recordBtn").onclick = safe(showRecording);
$("railRecord").onclick = safe(showRecording);
$("startRecording").onclick = safe(async () => {
  if (
    !$("recordFps").checkValidity() ||
    !$("recordAudioBitrate").checkValidity()
  )
    return toast("Controlla FPS e bitrate audio.");
  $("startRecording").disabled = true;
  try {
    const settings = {
        format: $("recordFormat").value,
        height: Number($("recordHeight").value),
        fps: Number($("recordFps").value),
        quality: Number($("recordQuality").value),
        audioBitrate: Number($("recordAudioBitrate").value),
      },
      system = $("systemAudio").checked;
    await studio.chooseSource({
      id: $("captureSource").value,
      systemAudio: system,
    });
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: {
        height: { max: settings.height },
        frameRate: { ideal: settings.fps, max: settings.fps },
      },
      audio: system,
    });
    captureStreams.push(screen);
    const audio = [];
    if (system && screen.getAudioTracks().length) audio.push(screen);
    else if (system) toast("La sorgente non fornisce audio di sistema.");
    if ($("microphone").checked) {
      const id = $("microphoneDevice").value,
        processing = $("audioProcessing").checked,
        mic = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            ...(id !== "default" ? { deviceId: { exact: id } } : {}),
            echoCancellation: processing,
            noiseSuppression: processing,
            autoGainControl: processing,
          },
        });
      captureStreams.push(mic);
      audio.push(mic);
    }
    const mixed = new MediaStream(screen.getVideoTracks());
    if (audio.length) {
      audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();
      for (const s of audio)
        audioContext.createMediaStreamSource(s).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
      await audioContext.resume();
    }
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw Error("Codec di registrazione non disponibile");
    await studio.beginRecording(settings);
    let writes = Promise.resolve(),
      writeError;
    const bitrate = Math.round(
      8000000 *
        (settings.height / 1080) ** 2 *
        (settings.fps / 30) *
        (0.2 + (settings.quality / 100) * 1.2),
    );
    recorder = new MediaRecorder(mixed, {
      mimeType: mime,
      videoBitsPerSecond: Math.max(200000, Math.min(80000000, bitrate)),
      audioBitsPerSecond: settings.audioBitrate * 1000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size)
        writes = writes
          .then(async () => studio.appendRecording(await e.data.arrayBuffer()))
          .catch((error) => {
            writeError = error;
            if (recorder?.state === "recording") recorder.stop();
          });
    };
    recorder.onstop = async () => {
      finishing = true;
      stopCapture();
      try {
        await writes;
        if (writeError) throw writeError;
        toast(
          "Finalizzazione " +
            settings.format.toUpperCase() +
            ": scegli dove salvare…",
        );
        const m = await studio.finishRecording();
        if (m) {
          checkpoint();
          project.media.push(m);
          renderLibrary();
          requestWave(m);
          toast(
            "Registrazione " +
              settings.format.toUpperCase() +
              " salvata e importata.",
          );
        }
      } catch (e) {
        await studio.abortRecording();
        toast(e.message);
      } finally {
        finishing = false;
      }
    };
    recorder.onerror = (e) => {
      toast(e.error?.message || "Errore di registrazione");
      if (recorder?.state !== "inactive") recorder.stop();
    };
    screen.getVideoTracks()[0].onended = () => {
      if (recorder?.state === "recording") recorder.stop();
    };
    recorder.start(1000);
    startTime = Date.now();
    $("recordDialog").close();
    $("recordingBar").hidden = false;
    $("recordingTime").textContent =
      "● " + settings.format.toUpperCase() + " · " + settings.fps + " FPS";
    recordTimer = setInterval(
      () =>
        ($("recordingTime").textContent =
          "● " +
          settings.format.toUpperCase() +
          " · " +
          fmt((Date.now() - startTime) / 1000)),
      500,
    );
  } catch (e) {
    stopCapture();
    await studio.abortRecording();
    throw e;
  } finally {
    $("startRecording").disabled = false;
  }
});
$("stopRecording").onclick = () => {
  if (recorder?.state === "recording") recorder.stop();
};
window.onbeforeunload = (e) => {
  if (recorder || finishing || exportBusy) {
    e.preventDefault();
    e.returnValue = "Operazione in corso";
  }
};
window.onresize = () => {
  renderTimeline();
  draw();
};
studio
  .fonts()
  .then((fonts) => {
    for (const name of [...new Set(["Arial", ...fonts])]) {
      if ([...$("annotationFont").options].some((o) => o.value === name))
        continue;
      const o = el("option", "", name);
      o.value = name;
      $("annotationFont").append(o);
    }
    properties();
  })
  .catch(() => {});
render();
