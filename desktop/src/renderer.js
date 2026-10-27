"use strict";
const $ = (id) => document.getElementById(id),
  uid = () => crypto.randomUUID(),
  clone = (x) => JSON.parse(JSON.stringify(x));
// One accessible, themed confirmation at a time. Escape always cancels safely.
let appDialogQueue = Promise.resolve();
function showAppDialog(options) {
  const job = appDialogQueue.then(
    () =>
      new Promise((resolve) => {
        const dialog = $("appDialog"),
          actions = $("appDialogActions");
        const cancel = options.cancelId ?? options.buttons.length - 1;
        $("appDialogTitle").textContent = options.title || options.message;
        $("appDialogMessage").textContent = options.title
          ? options.message
          : "";
        $("appDialogMessage").hidden = !options.title;
        $("appDialogDetail").textContent = options.detail || "";
        $("appDialogDetail").hidden = !options.detail;
        actions.replaceChildren();
        options.buttons.forEach((label, index) => {
          const button = document.createElement("button");
          button.textContent = label;
          button.value = String(index);
          button.className =
            index === (options.defaultId ?? 0) && index !== cancel
              ? "primary"
              : "";
          button.dataset.choice = String(index);
          actions.append(button);
        });
        dialog.returnValue = String(cancel);
        const onCancel = () => {
          dialog.returnValue = String(cancel);
        };
        const onKeydown = (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dialog.close(String(cancel));
          }
        };
        dialog.addEventListener("cancel", onCancel);
        dialog.addEventListener("keydown", onKeydown);
        dialog.addEventListener(
          "close",
          () => {
            dialog.removeEventListener("cancel", onCancel);
            dialog.removeEventListener("keydown", onKeydown);
            const response = Number(dialog.returnValue);
            resolve(
              Number.isInteger(response) &&
                response >= 0 &&
                response < options.buttons.length
                ? response
                : cancel,
            );
          },
          { once: true },
        );
        dialog.showModal();
        actions.children[options.defaultId ?? 0]?.focus();
      }),
  );
  appDialogQueue = job.catch(() => {});
  return job;
}
studio.onAppDialog(({ requestId, options }) => {
  showAppDialog(options)
    .then((response) => studio.respondAppDialog(requestId, response))
    .catch((error) => toast(error.message));
});
let previewFocus = null;
let workspacePrefs = {
  imageDuration: 5,
  freezeDuration: 5,
  rulerColor: "#335d80",
};
let mediaColumns = Math.max(
  1,
  Math.floor(Number(localStorage.getItem("akhbar-media-columns")) || 3),
);
let draggedElement = null;

let project = Timeline.empty(),
  selection = new Set(),
  time = 0,
  scale = 40,
  playing = false,
  preparing = false,
  frame,
  history = [],
  future = [],
  exportBusy = false,
  exportCancelled = false;
let mediaView = localStorage.getItem("akhbar-media-view") || "grid";
const edgeSnapEnabled = true; // Always enabled; independent from family gap closure.
let timelineClipboard = null,
  selectedMediaId = null;
let rippleFamily = localStorage.getItem("akhbar-family-ripple") === "true";
let fitTimeline = false;
const thumbCache = new Map();
let thumbQueue = Promise.resolve();
let previewPreparation = null;
function beginPreviewPreparation(title = "Preparazione delle anteprime") {
  const dialog = $("previewPreparation");
  $("previewPreparationTitle").textContent = title;
  $("previewPreparationPhase").textContent = "Preparazione dei file…";
  const batch = new PreparationBatch(
    (state) => {
      if (previewPreparation !== batch) return;
      $("previewPreparationProgress").value = state.percent;
      $("previewPreparationPercent").textContent = state.percent + "%";
      $("previewPreparationCount").textContent =
        `${state.done} / ${state.total} operazioni completate`;
      if (state.phase) $("previewPreparationPhase").textContent = state.phase;
    },
    (state) => {
      if (previewPreparation !== batch) return;
      $("previewPreparationPhase").textContent = state.failed
        ? "Preparazione completata con alcuni file non disponibili"
        : "Pronto";
      draw();
      setTimeout(() => {
        if (previewPreparation !== batch) return;
        previewPreparation = null;
        dialog.close();
        if (state.failed)
          toast(
            "Alcune anteprime non sono disponibili. Controlla i file originali.",
          );
        else
          toast(
            title.includes("DeepFilterNet3")
              ? "Riduzione del rumore pronta."
              : "Anteprime pronte.",
          );
      }, 300);
    },
  );
  previewPreparation = batch;
  $("previewPreparationProgress").value = 0;
  $("previewPreparationPercent").textContent = "0%";
  $("previewPreparationCount").textContent = "Preparazione…";
  if (!dialog.open) dialog.showModal();
  queueMicrotask(() => queueMicrotask(() => batch.seal()));
  return batch;
}
$("previewPreparation").addEventListener("cancel", (e) => e.preventDefault());
studio.onAudioPreparationProgress((state) => {
  previewPreparation?.report(
    "noise:" + state.clipId,
    state.percent,
    state.phase,
  );
  previewPreparation?.report("initial-audio", state.percent, state.phase);
});
function prepareNoisePreviews(clips) {
  clips = clips.filter(
    (c) => c.voice?.noise > 0 && !c.voice.bypass && mediaOf(c).hasAudio,
  );
  if (!clips.length) return;
  const batch = beginPreviewPreparation(
    "Riduzione del rumore · DeepFilterNet3",
  );
  for (const c of clips) {
    const job = studio.audioPreview(clone(c), clone(mediaOf(c)));
    batch.track("noise:" + c.id, job);
    job.catch((e) => toast("Riduzione del rumore: " + e.message));
  }
}
function thumbnail(m, at, image) {
  const key = m.path + ":" + at.toFixed(4);
  if (m.kind !== "image" && !thumbCache.has(key)) {
    const job = thumbQueue.then(() => studio.thumbnail(m.path, at));
    thumbQueue = job.catch(() => {});
    thumbCache.set(key, job);
    job.catch(() => thumbCache.delete(key));
  }
  const loaded = Promise.resolve(
    m.kind === "image" ? m.url : thumbCache.get(key),
  ).then(async (url) => {
    if (image.isConnected) image.src = url;
    else return;
    await image.decode();
  });
  previewPreparation?.track("thumbnail:" + key, loaded);
  loaded.catch(() => {
    image.hidden = true;
    image.closest(".media-poster")?.classList.add("unavailable");
  });
  return loaded;
}
let cleanProjectJSON = JSON.stringify(project),
  transitionBusy = false;
const videoPool = new Map();
let previewPaintFrame = null,
  previewNeedsSync = false;
let scrubbingPreview = false,
  scrubIdleTimer;
function requestPreviewPaint(sync = false) {
  previewNeedsSync ||= sync;
  if (previewPaintFrame !== null) return;
  previewPaintFrame = requestAnimationFrame(() => {
    previewPaintFrame = null;
    const needsSync = previewNeedsSync;
    previewNeedsSync = false;
    if (needsSync) syncPlayers();
    draw();
  });
}
function markPreviewScrubbing() {
  clearTimeout(scrubIdleTimer);
  if (!scrubbingPreview) {
    scrubbingPreview = true;
    updatePreviewView();
  }
  scrubIdleTimer = setTimeout(finishPreviewScrubbing, 160);
}
function finishPreviewScrubbing() {
  clearTimeout(scrubIdleTimer);
  if (!scrubbingPreview) return;
  scrubbingPreview = false;
  updatePreviewView();
  requestPreviewPaint(true);
}
function rememberVideoFrame(p) {
  const video = p.element;
  if (video.seeking || video.readyState < 2 || !video.videoWidth) return;
  const width = Math.min(video.videoWidth, $("previewCanvas").width);
  const height = Math.max(
    1,
    Math.round((width * video.videoHeight) / video.videoWidth),
  );
  if (
    p.lastFrame &&
    p.lastFrameTime === video.currentTime &&
    p.lastFrame.width === width &&
    p.lastFrame.height === height
  )
    return;
  const snapshot = p.lastFrame || document.createElement("canvas");
  if (snapshot.width !== width) snapshot.width = width;
  if (snapshot.height !== height) snapshot.height = height;
  try {
    snapshot.getContext("2d").drawImage(video, 0, 0, width, height);
    p.lastFrame = snapshot;
    p.lastFrameTime = video.currentTime;
  } catch {}
}

const transport = new AudioTransport((c, m, page) =>
  studio.audioData(c, m, page),
);
const players = new Map(),
  waves = new Map();
let draggedMedia = null;
let waveQueue = Promise.resolve(),
  toastTimer,
  waveEpoch = 0;
let keys = { split: "s", play: " ", delete: "Delete" };
try {
  keys = { ...keys, ...JSON.parse(localStorage.getItem("crea-keys") || "{}") };
} catch {}
const mediaOf = (c) => project.media.find((m) => m.id === c.mediaId),
  selected = () =>
    project.clips
      .flatMap((c) => [
        c,
        ...(c.attachments || []).map((a) =>
          Object.assign(a, Timeline.attachmentClip(c, a)),
        ),
      ])
      .filter((c) => selection.has(c.id)),
  first = () => selected().find((c) => c.id === previewFocus) || selected()[0];
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
  if (previewPaintFrame !== null) cancelAnimationFrame(previewPaintFrame);
  previewPaintFrame = null;
  previewNeedsSync = false;
  for (const p of videoPool.values()) {
    p.seeker?.dispose();
    p.element.onload = p.element.onerror = null;
    p.element.pause?.();
    p.element.removeAttribute("src");
    p.element.load?.();
  }
  players.clear();
  videoPool.clear();
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
  updatePreviewView();
  renderLibrary();
  renderTimeline();
  properties();
  warmAudio();
  syncPlayers(true);
  draw();
  $("undoBtn").disabled = !history.length;
  $("redoBtn").disabled = !future.length;
}
function changed(preserveTime = false) {
  updatePreviewView();
  if (!preserveTime) time = Math.min(time, Timeline.total(project.clips));
  renderTimeline();
  properties();
  warmAudio();
  syncPlayers(true);
  draw();
  $("undoBtn").disabled = !history.length;
  $("redoBtn").disabled = !future.length;
}
function groupMembers(ids) {
  return Timeline.linkedIds(project.clips, ids);
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
function warmAudio() {
  const job = transport.prepare(project, time);
  previewPreparation?.track("initial-audio", job);
  job.catch((e) => toast("Preparazione audio: " + e.message));
}
function requestWave(m) {
  if (!m.hasAudio || waves.has(m.id)) return;
  waves.set(m.id, { pending: true });
  const epoch = waveEpoch;
  const job = waveQueue.then(async () => {
    if (epoch !== waveEpoch) return;
    try {
      const wave = await studio.waveform(m.path, m.audioChannels);
      if (epoch !== waveEpoch) return;
      let max = 0;
      for (const peak of wave.peaks) max = Math.max(max, peak);
      wave.max = max || 1;
      waves.set(m.id, wave);
    } catch (e) {
      waves.set(m.id, { error: e.message });
      toast("Forma d’onda non disponibile per " + m.name + ": " + e.message);
      throw e;
    } finally {
      if (epoch === waveEpoch) renderTimeline();
    }
  });
  waveQueue = job.catch(() => {});
  previewPreparation?.track("waveform:" + m.id, job);
  return job;
}
function renderLibrary() {
  const list = $("mediaList");
  list.classList.toggle("grid", mediaView === "grid");
  list.style.setProperty("--media-columns", String(mediaColumns));
  $("mediaGrid").setAttribute("aria-pressed", String(mediaView === "grid"));
  $("mediaListView").setAttribute("aria-pressed", String(mediaView === "list"));
  $("mediaColumns").textContent = String(mediaColumns);
  $("mediaColumnsMinus").disabled = mediaColumns <= 1;
  list.replaceChildren();
  const actual = project.media.filter(
    (m) => !["annotation", "effect"].includes(m.kind),
  );
  $("mediaCount").textContent = actual.length;
  $("libraryEmpty").hidden = !!actual.length;
  for (const m of actual) {
    const card = el("div", "media-card");
    card.tabIndex = 0;
    card.dataset.mediaId = m.id;
    card.classList.toggle("selected", selectedMediaId === m.id);
    card.setAttribute("aria-selected", String(selectedMediaId === m.id));
    card.onclick = (e) => {
      if (e.target.closest("button")) return;
      selectedMediaId = m.id;
      for (const item of list.children) {
        const active = item.dataset.mediaId === m.id;
        item.classList.toggle("selected", active);
        item.setAttribute("aria-selected", String(active));
      }
    };
    card.onkeydown = (e) => {
      if (e.key === "Enter") showSource(m);
    };
    const poster = el("div", "media-poster");
    poster.append(
      el("span", "media-placeholder", m.kind === "audio" ? "♫" : "▷"),
    );
    if (m.kind !== "audio") {
      const img = el("img", "media-thumb");
      img.alt = m.name;
      poster.append(img);
      queueMicrotask(() => thumbnail(m, 0, img));
    }
    const seconds = Math.max(0, Math.floor(m.duration || 0));
    poster.append(
      el(
        "span",
        "media-duration",
        `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
      ),
    );
    card.append(poster);
    card.draggable = true;
    const text = el("div", "media-meta");
    text.append(el("strong", "", m.name));
    text.title = m.name;
    card.append(text);
    const add = el("button", "add-media", "＋");
    add.title = "Aggiungi al cursore, sulla traccia scelta";
    add.setAttribute(
      "aria-label",
      "Aggiungi " + m.name + " alla traccia selezionata",
    );
    add.onclick = () => addMedia(m.id, time, Number($("activeTrack").value));
    poster.append(add);
    card.ondragend = () => {
      draggedMedia = null;
      document.querySelectorAll(".drop-ghost").forEach((n) => n.remove());
    };
    card.ondragstart = (e) => {
      draggedMedia = m.id;
      e.dataTransfer.setData("application/crea-media", m.id);
    };
    card.ondblclick = (e) => {
      if (!e.target.closest("button")) showSource(m);
    };
    list.append(card);
  }
}
async function imported(result) {
  if (result.media.length) {
    beginPreviewPreparation();
    checkpoint();
    project.media.push(...result.media);
    if (
      !project.canvasSize &&
      result.media.some(
        (m) => ["video", "image"].includes(m.kind) && m.width && m.height,
      )
    )
      project.canvasSize = Timeline.projectSize(project);
    updatePreviewView();
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
    out: m.kind === "image" ? workspacePrefs.imageDuration : m.duration,
    speed: 1,
    volume: 1,
    mono: true,
  };
  if (!Timeline.canPlace(project.clips, [c])) {
    toast("Intervallo occupato: scegli uno spazio libero o un’altra traccia.");
    return;
  }
  if (!project.media.some((existing) => existing.id === m.id))
    project.media.push(m);
  c.sourceInstanceId ||= c.id;
  project.clips.push(c);
  selection = new Set([c.id]);
  changed();
  focusNode(c.id);
  return c;
}
$("importBtn").ondragover = (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  $("importBtn").classList.add("dragover");
};
$("importBtn").ondragleave = () => $("importBtn").classList.remove("dragover");
$("importBtn").ondrop = () => $("importBtn").classList.remove("dragover");
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener(
  "drop",
  safe(async (e) => {
    e.preventDefault();
    if (e.dataTransfer.getData("application/akhbar-element")) return;
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
function annotation(type, placement) {
  pause();
  if (!placement) checkpoint();
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
  const c = {
    id: uid(),
    mediaId: m.id,
    start: placement?.start ?? time,
    track: placement?.track ?? Number($("activeTrack").value),
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
  if (!Timeline.canPlace(project.clips, [c])) {
    toast("Intervallo occupato: scegli uno spazio libero o un’altra traccia.");
    return;
  }
  if (!project.media.some((existing) => existing.id === m.id))
    project.media.push(m);
  project.clips.push(c);
  selection = new Set([c.id]);
  changed();
  focusNode(c.id);
}
$("addText").onclick = () => annotation("text");
$("addArrow").onclick = () => annotation("arrow");
$("addCircle").onclick = () => annotation("circle");
let rulerPaintFrame = null;
function requestRulerPaint() {
  if (rulerPaintFrame !== null) return;
  rulerPaintFrame = requestAnimationFrame(() => {
    rulerPaintFrame = null;
    renderRuler();
  });
}
function renderRuler() {
  const ruler = $("ruler"),
    sc = $("timelineScroll"),
    width = sc.clientWidth;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = '600 11px "Segoe UI", Arial, sans-serif';
  const { step, labels } = Timeline.rulerLabels(
    scale,
    sc.scrollLeft,
    width,
    (text) => measure.measureText(text).width + 8,
  );
  const fragment = document.createDocumentFragment();
  for (const { time, text } of labels) {
    const tick = el("span", "tick", text);
    tick.style.left = time * scale + "px";
    fragment.append(tick);
  }
  const minor = step / 5,
    from = Math.ceil(sc.scrollLeft / scale / minor),
    to = Math.floor((sc.scrollLeft + width) / scale / minor);
  for (let i = from; i <= to; i++) {
    const tick = el("span", "ruler-mark");
    tick.style.left = i * minor * scale + "px";
    fragment.append(tick);
  }
  ruler.replaceChildren(fragment);
}
function renderTimeline() {
  const sc = $("timelineScroll"),
    total = Timeline.total(project.clips);
  const minimum = minimumZoom();
  if (fitTimeline) scale = fitScale();
  $("zoom").min = String(minimum);
  $("timeline").style.width =
    Math.max(sc.clientWidth, (Math.max(total, time) + 20) * scale) + "px";
  renderRuler();
  ensureTrackRows();
  const blocks = Timeline.groups(project.clips);
  const joins = new Map();
  const groupIds = new Set(project.clips.map((c) => c.groupId).filter(Boolean));
  for (const id of groupIds)
    for (const run of Timeline.contiguousRuns(
      project.clips.filter((c) => c.groupId === id),
    )) {
      if (run.length < 2) continue;
      const duration =
        Math.max(...run.map((c) => c.start + Timeline.duration(c))) -
        Math.min(...run.map((c) => c.start));
      run.forEach((c, i) =>
        joins.set(c.id, { left: i > 0, right: i < run.length - 1, duration }),
      );
    }
  for (let track = 0; track < Timeline.trackCount(project); track++) {
    $("track" + track).replaceChildren();
    const height = project.trackHeights?.[track] || 100;
    $("track" + track).style.height = height + "px";
    const label = document.querySelector('[data-choose-track="' + track + '"]');
    label.style.height = height + "px";
    label.classList.toggle("compact-track", height < 64);
    const button = label.querySelector(".track-mute");
    button.textContent = project.trackMuted?.[track] ? "🔇" : "♪";
    button.setAttribute("aria-pressed", String(!!project.trackMuted?.[track]));
  }
  for (const block of blocks) {
    const members = block.members,
      c = members[0],
      m = mediaOf(c),
      group = !!block.compact,
      duration = joins.get(c.id)?.duration ?? block.end - block.start,
      title = `${group ? `Gruppo modificabile · ${members.length} clip` : m.name}\nDurata: ${fmt(group ? block.end - block.start : duration)}`,
      node = el(
        "div",
        `clip${group ? " group" : ""}${m.kind === "audio" ? " audio" : ""}${m.kind === "annotation" ? " annotation" : ""}${members.some((c) => selection.has(c.id)) ? " selected" : ""}`,
      );
    node.style.setProperty("--clip-color", Timeline.clipColor(c));
    node.dataset.colorSource = Timeline.colorSource(c);
    const rowHeight = project.trackHeights?.[block.track] || 100,
      padding = trackPadding(rowHeight);
    node.style.height = rowHeight - 2 * padding + "px";
    node.style.top = padding + "px";
    node.classList.toggle("compact-track", rowHeight < 64);
    if (c.groupId && !group) {
      node.classList.add("group");
      const join = joins.get(c.id);
      if (join?.left) {
        node.classList.add("joined-left");
        node.append(el("span", "group-cut"));
      }
      if (join?.right) node.classList.add("joined-right");
    }
    if (c.linkId) {
      node.classList.add("linked");
      const badge = el(
        "span",
        "link-badge",
        group ? "🔗 Gruppo" : "🔗 " + c.linkId.slice(0, 4),
      );
      badge.title = title;
      node.append(badge);
    }
    if (c.muted || project.trackMuted?.[c.track]) node.classList.add("muted");
    node.dataset.id = c.id;
    node.dataset.group = block.groupId || "";
    node.style.left = block.start * scale + "px";
    node.style.width = Math.max(5, (block.end - block.start) * scale) + "px";
    node.title = title;
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
      previewFocus = c.id;
      properties();
      showContext(e.clientX, e.clientY);
    };
    if (!group)
      for (const side of ["left", "right"]) {
        if (joins.get(c.id)?.[side]) continue;
        const h = el("span", "handle " + side);
        h.onpointerdown = (e) => trimDrag(e, c, side);
        node.append(h);
      }
    $("track" + block.track).append(node);
    drawWave(node, block);
    if (["video", "image"].includes(m.kind)) {
      const img = el("img", "clip-thumb");
      img.alt = "Primo fotogramma del segmento";
      node.append(img);
      thumbnail(m, c.in, img);
    }
  }
  syncTrackHeightControl();
  $("durationLabel").textContent =
    `${project.clips.length} clip · ${fmt(total)}`;
  $("zoom").value = scale;
  $("zoomLabel").textContent =
    (scale < 1 ? scale.toFixed(3) : Math.round(scale)) + " px/s";
  updateHead();
  drawRecordRange();
}
function drawWave(node, block) {
  const sc = $("timelineScroll");
  if (
    block.start * scale > sc.scrollLeft + sc.clientWidth + 10 ||
    block.end * scale < sc.scrollLeft - 10
  )
    return;
  const blockLeft = block.start * scale,
    left = Math.max(0, sc.scrollLeft - blockLeft - 10),
    width = Math.max(
      0,
      Math.min((block.end - block.start) * scale - left, sc.clientWidth + 20),
    );
  if (!width || !block.members.some((c) => waves.get(c.mediaId)?.peaks)) return;
  const cv = el("canvas", "waveform"),
    dpr = window.devicePixelRatio || 1;
  const height = Math.max(
    4,
    parseFloat(node.style.height) -
      (node.classList.contains("compact-track") ? 4 : 26),
  );
  cv.width = Math.ceil(width * dpr);
  cv.height = Math.ceil(height * dpr);
  cv.style.height = height + "px";
  cv.style.left = left + "px";
  cv.style.width = width + "px";
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#b8e6db";
  ctx.beginPath();
  ctx.moveTo(0, cv.height);
  for (let x = 0; x < cv.width; x++) {
    const t = block.start + (left + x / dpr) / scale;
    let peak = 0;
    for (const c of block.members) {
      const wave = waves.get(c.mediaId);
      if (!wave?.peaks) continue;
      // Select the finest level appropriate to this physical pixel: never stretch 50-Hz bins.
      const perPixel = (c.speed || 1) / scale / dpr;
      let level = { rate: wave.rate, peaks: wave.peaks };
      for (const l of wave.levelsOfDetail || [])
        if (l.rate >= 1 / perPixel) level = l;
      const from = Timeline.sourceTime(c, t),
        a = Math.max(0, Math.floor(from * level.rate));
      const b = Math.min(
        level.peaks.length,
        Math.max(a + 1, Math.ceil((from + perPixel) * level.rate)),
      );
      for (let i = a; i < b; i++)
        peak = Math.max(peak, (level.peaks[i] * c.volume) / (wave.max || 1));
    }
    ctx.lineTo(x, cv.height - 1 - Math.min(1, peak) * (cv.height - 2));
  }
  ctx.lineTo(cv.width, cv.height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#70ac9e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cv.height - 0.5);
  ctx.lineTo(cv.width, cv.height - 0.5);
  ctx.stroke();
  node.append(cv);
}
$("timelineScroll").onscroll = () => {
  requestRulerPaint();
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
  const origin = selected().map((c) => ({ c, start: c.start, track: c.track }));
  const x = e.clientX,
    y = e.clientY,
    scroll = $("timelineScroll").scrollLeft;
  const sourceHeight = $("track" + block.track).getBoundingClientRect().height;
  let moved = false,
    proposals = [],
    valid = false,
    add = 0,
    previousDelta = 0,
    latch = null,
    insertion = null;
  const ghosts = origin.map(() => {
    const n = el("div", "drop-ghost");
    document.body.append(n);
    return n;
  });
  const guide = el("div", "timeline-snap-guide");
  guide.hidden = true;
  document.body.append(guide);
  const cleanup = () => {
    ghosts.forEach((n) => n.remove());
    guide.remove();
    $("newTrackDrop").classList.remove("dragover");
  };
  const update = (ev) => {
    if (!moved && Math.hypot(ev.clientX - x, ev.clientY - y) < 4) return;
    moved = true;
    const intentional =
      Math.abs(ev.clientY - y) >=
      Math.max(32, Math.min(64, sourceHeight * 0.45));
    const zone = $("newTrackDrop").getBoundingClientRect();
    const newTrack =
      intentional && ev.clientY >= zone.top && ev.clientY <= zone.bottom;
    const target = [...document.querySelectorAll(".track")].find((n) => {
      const r = n.getBoundingClientRect(),
        inset = n.dataset.track === String(block.track) ? 0 : 12;
      return ev.clientY >= r.top + inset && ev.clientY < r.bottom - inset;
    });
    let td = block.compact
      ? 0
      : newTrack
        ? Timeline.trackCount(project) - Math.min(...origin.map((o) => o.track))
        : intentional && target
          ? Number(target.dataset.track) - block.track
          : 0;
    if (!newTrack)
      td = Math.max(
        -Math.min(...origin.map((o) => o.track)),
        Math.min(
          Timeline.trackCount(project) -
            1 -
            Math.max(...origin.map((o) => o.track)),
          td,
        ),
      );
    const rawDelta = Math.max(
      -Math.min(...origin.map((o) => o.start)),
      (ev.clientX - x + $("timelineScroll").scrollLeft - scroll) / scale,
    );
    const snapped = Timeline.snapMove(project.clips, origin, rawDelta, td, {
      enabled: edgeSnapEnabled,
      scale,
      previousDelta,
      latch,
    });
    previousDelta = rawDelta;
    latch = snapped.latch;
    proposals = origin.map((o) => ({
      ...o.c,
      start: o.start + snapped.delta,
      track: o.track + td,
    }));

    insertion = null;
    if (!newTrack && !block.compact) {
      const remaining = project.clips.filter(
        (c) => !origin.some((o) => o.c.id === c.id),
      );
      const tr = block.track + td;
      const at = Timeline.insertionPoint(
        { clips: remaining },
        tr,
        (ev.clientX - $("ruler").getBoundingClientRect().left) / scale,
        14 / scale,
      );
      if (at !== null) {
        try {
          insertion = {
            project: Timeline.moveInsert(
              project,
              origin.map((o) => o.c.id),
              at,
              tr,
            ),
            at,
            track: tr,
          };
        } catch {}
      }
    }
    add = Math.max(
      0,
      ...proposals.map((c) => c.track + 1 - Timeline.trackCount(project)),
    );
    valid =
      Timeline.canPlace(project.clips, proposals) &&
      Timeline.trackCount(project) + add <= Timeline.MAX_TRACKS;
    $("newTrackDrop").classList.toggle("dragover", newTrack);
    if (insertion) valid = true;
    guide.hidden = !insertion && (!latch || !valid);
    guide.classList.toggle("insertion-guide", !!insertion);
    if (insertion) {
      const r = $("track" + insertion.track).getBoundingClientRect();
      Object.assign(guide.style, {
        left:
          $("ruler").getBoundingClientRect().left + insertion.at * scale + "px",
        top: r.top + "px",
        height: r.height + "px",
      });
    }
    proposals.forEach((c, i) => {
      const r = newTrack ? zone : $("track" + c.track)?.getBoundingClientRect(),
        ghost = ghosts[i];
      ghost.classList.toggle("invalid", !valid);
      ghost.classList.toggle("snapped", !!latch && valid);
      if (r)
        Object.assign(ghost.style, {
          left:
            $("ruler").getBoundingClientRect().left + c.start * scale + "px",
          top: r.top + 4 + "px",
          width: Math.max(5, Timeline.duration(c) * scale) + "px",
          height: (newTrack ? zone.height - 8 : r.height - 8) + "px",
        });
      ghost.textContent = valid
        ? latch
          ? "Agganciato · " + fmt(c.start)
          : "Rilascia qui"
        : "Intervallo occupato";
      if (!insertion && latch && r && c.id === latch.originId)
        Object.assign(guide.style, {
          left:
            $("ruler").getBoundingClientRect().left + latch.at * scale + "px",
          top: r.top + "px",
          height: r.height + "px",
        });
    });
  };
  captureMove(e, update, (ev) => {
    if (ev.type === "pointercancel") {
      cleanup();
      return;
    }
    // The release can contain a newer position than the last pointermove.
    update(ev);
    cleanup();
    if (!moved) {
      if (!e.ctrlKey && !e.shiftKey) selectIds(ids);
      return;
    }
    if (!valid)
      return toast("Posizione non disponibile: le clip sono rimaste ferme.");
    checkpoint();
    if (insertion) {
      project = insertion.project;
      changed();
      return;
    }
    for (let i = 0; i < add; i++) Timeline.addTrack(project);
    proposals.forEach((c) => {
      const target = project.clips.find((o) => o.id === c.id);
      Object.assign(target, c);
      delete target.speedHomeTrack;
    });
    changed();
  });
}
function trimJoinedDrag(e, c, side) {
  const dragScale = scale,
    fitBefore = fitTimeline;
  fitTimeline = false;
  selectIds([c.id]);
  const before = clone(project),
    x = e.clientX,
    scroll = $("timelineScroll").scrollLeft;
  let next = before,
    lastValidDelta = 0;
  const move = (ev) => {
    try {
      const delta =
        (ev.clientX - x + $("timelineScroll").scrollLeft - scroll) / dragScale;
      next = Timeline.trimJoined(before, c.id, side, delta);
      lastValidDelta = delta;
      project = next;
      selection = new Set(
        Timeline.linkedIds(
          project.clips,
          project.clips
            .filter((item) => item.groupId === c.groupId)
            .map((item) => item.id),
        ),
      );
      changed();
    } catch {
      /* Keep the last valid position when another clip blocks the edge. */
    }
  };
  captureMove(e, move, (ev) => {
    if (ev.type === "pointercancel") project = before;
    else {
      move(ev);
      try {
        project = Timeline.trimJoined(
          before,
          c.id,
          side,
          lastValidDelta,
          rippleFamily,
        );
        if (JSON.stringify(project) !== JSON.stringify(before)) {
          history.push(JSON.stringify(before));
          future = [];
        }
      } catch (error) {
        project = before;
        toast(error.message);
      }
    }
    fitTimeline = fitBefore;
    changed();
  });
}
function trimDrag(e, c, side) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pause();
  if (c.groupId) return trimJoinedDrag(e, c, side);
  const dragScale = scale,
    fitBefore = fitTimeline;
  fitTimeline = false;
  selectIds([c.id]);
  const x = e.clientX,
    before = clone(project),
    old = clone(c),
    m = mediaOf(c),
    scroll = $("timelineScroll").scrollLeft;
  let lastX = x;
  const move = (ev) => {
    lastX = ev.clientX;
    const delta =
        (lastX - x + $("timelineScroll").scrollLeft - scroll) / dragScale,
      rate = old.speed || 1;
    Object.assign(c, old);
    if (side === "left") {
      const newStart = Math.max(
        0,
        Math.min(old.start + Timeline.duration(old) - 0.02, old.start + delta),
      );
      c.in = Math.max(0, old.in + (newStart - old.start) * rate);
      c.start = old.start + (c.in - old.in) / rate;
    } else {
      c.out = Math.max(
        c.in + 0.02 * rate,
        Math.min(
          ["image", "annotation", "effect"].includes(m.kind)
            ? 86400
            : m.duration,
          old.out + delta * rate,
        ),
      );
    }
    if (!Timeline.canPlace(project.clips, [c])) Object.assign(c, old);
    changed();
  };
  captureMove(e, move, (ev) => {
    if (ev.type === "pointercancel") {
      project = before;
      fitTimeline = fitBefore;
      changed();
      return;
    }
    move(ev);
    try {
      const result = Timeline.trimFamilySegment(before, c.id, c, rippleFamily);
      if (JSON.stringify(result) !== JSON.stringify(before)) {
        history.push(JSON.stringify(before));
        future = [];
      }
      project = result;
    } catch (error) {
      project = before;
      toast(error.message);
    }
    fitTimeline = fitBefore;
    changed();
  });
}
function bindTrack(track) {
  const target = $("track" + track);
  target.oncontextmenu = (e) => showTrackContext(e, track);
  let ghost;
  const clear = () => {
    ghost?.remove();
    ghost = null;
    target.classList.remove("dragover");
  };
  target.ondragover = (e) => {
    e.preventDefault();
    clear();
    target.classList.add("dragover");
    const m = draggedElement
      ? { duration: 5 }
      : project.media.find((m) => m.id === draggedMedia);
    if (!m) return;
    const start = Math.max(
      0,
      (e.clientX - target.getBoundingClientRect().left) / scale,
    );
    const c = {
      id: "drop-preview",
      start,
      track,
      in: 0,
      out: m.duration,
      speed: 1,
    };
    c.start += edgeSnapEnabled
      ? Timeline.snap(project.clips, [{ c, start, track }], 0, 0, 16 / scale)
      : 0;
    ghost = el("div", "drop-ghost");
    const r = target.getBoundingClientRect();
    Object.assign(ghost.style, {
      left: r.left + c.start * scale + "px",
      top: r.top + 4 + "px",
      width: Timeline.duration(c) * scale + "px",
      height: r.height - 8 + "px",
    });
    ghost.classList.toggle(
      "invalid",
      draggedElement
        ? Timeline.trackCount(project) >= Timeline.MAX_TRACKS
        : !Timeline.canPlace(project.clips, [c]),
    );
    if (draggedElement) {
      ghost.classList.add("element-drop");
      ghost.textContent = "Nuova traccia sopra · " + fmt(c.start);
    }
    document.body.append(ghost);
  };
  target.ondragleave = clear;
  target.ondrop = (e) => {
    e.preventDefault();
    clear();
    const element = e.dataTransfer.getData("application/akhbar-element");
    if (element) {
      e.stopPropagation();
      safe(() =>
        insertElement(
          element,
          Math.max(
            0,
            (e.clientX - target.getBoundingClientRect().left) / scale,
          ),
          track + 1,
        ),
      )();
      return;
    }
    const id = e.dataTransfer.getData("application/crea-media");
    if (id) {
      e.stopPropagation();
      const start = Math.max(
        0,
        (e.clientX - target.getBoundingClientRect().left) / scale,
      );
      const m = project.media.find((m) => m.id === id);
      const fake = { id: "drop", start, track, in: 0, out: m.duration };
      const delta = edgeSnapEnabled
        ? Timeline.snap(
            project.clips,
            [{ c: fake, start, track }],
            0,
            0,
            16 / scale,
          )
        : 0;
      addMedia(id, start + delta, track);
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
$("ruler").onpointerdown = (e) => {
  if (e.button !== 0) return;
  pause();
  if (e.shiftKey) {
    const begin = Math.max(
      0,
      (e.clientX - $("ruler").getBoundingClientRect().left) / scale,
    );
    const range = (ev) => {
      const at = Math.max(
        0,
        (ev.clientX - $("ruler").getBoundingClientRect().left) / scale,
      );
      $("rangeStart").value = Math.min(begin, at).toFixed(3);
      $("rangeEnd").value = Math.max(begin, at).toFixed(3);
      drawRecordRange();
    };
    range(e);
    captureMove(e, range);
    return;
  }
  const move = (ev) =>
    seek((ev.clientX - $("ruler").getBoundingClientRect().left) / scale, true);
  move(e);
  captureMove(e, move, finishPreviewScrubbing);
};
function fitScale() {
  return Math.min(
    640,
    Math.max(
      0.0001,
      Math.max(
        1,
        $("timelineScroll").clientWidth -
          Math.max(100, $("timelineScroll").clientWidth * 0.12),
      ) / Math.max(1, Timeline.total(project.clips)),
    ),
  );
}
function minimumZoom() {
  return Math.min(8, fitScale());
}
function setZoom(value) {
  fitTimeline = false;
  const sc = $("timelineScroll"),
    oldX = time * scale - sc.scrollLeft,
    anchor = oldX >= 0 && oldX <= sc.clientWidth ? oldX : sc.clientWidth / 2;
  scale = Math.max(minimumZoom(), Math.min(640, Number(value)));
  renderTimeline();
  sc.scrollLeft = Math.max(0, time * scale - anchor);
}
$("timelineScroll").addEventListener(
  "wheel",
  (e) => {
    const delta = e.deltaY || e.deltaX;
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom(scale * Math.exp(-delta * 0.002));
    } else if (e.shiftKey) {
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
    c = first(),
    m = c && mediaOf(c);
  $("noSelection").hidden = !!c;
  $("clipProperties").hidden = !c;
  $("selectionCount").textContent = all.length ? `${all.length} clip` : "";
  if (!c) return;
  $("lockAspect").checked = !c.aspectUnlocked;
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
    voiceNoise: (c.voice?.noise || 0) * 100,
    voiceLevel: (c.voice?.level || 0) * 100,
    textWidth: c.annotation?.width || 80,
  }))
    $(id).value =
      typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
  $("contextSpeedValue").textContent = speedLabel(c.speed || 1);
  $("visualZoom").value = c.zoom?.from || 1;
  $("volumeValue").textContent = Math.round(c.volume * 100) + "%";
  $("trimIn").disabled = all.length > 1;
  $("trimOut").disabled = all.length > 1;
  $("muteClip").checked = !!c.muted;
  $("monoClip").checked = !!c.mono;
  $("audioMode").value = c.mono ? "mono" : "stereo";
  $("noiseCompare").setAttribute("aria-pressed", String(!!c.voice?.bypass));
  $("noiseCompare").textContent = c.voice?.bypass
    ? "Originale attivo · ascolta elaborato"
    : "Ascolta originale (prima/dopo)";
  const annotation = m.kind === "annotation";
  $("annotationPanel").hidden = !annotation;
  document.querySelector(".align-actions").hidden = m.kind === "audio";
  $("layoutPanel").hidden = annotation || ["audio", "effect"].includes(m.kind);
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
    if (JSON.stringify(project) === JSON.stringify(before)) return;
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
    delete c.speedHomeTrack;
  });
};
$("clipTrack").onchange = () => {
  const delta = Number($("clipTrack").value) - first().track;
  edit((c) => {
    c.track += delta;
    delete c.speedHomeTrack;
  });
};
for (const id of ["trimIn", "trimOut"])
  $(id).onchange = () =>
    edit((c) => {
      c.in = Number($("trimIn").value);
      c.out = Number($("trimOut").value);
    });
function speedLabel(speed) {
  return String(Math.round(speed * 1000) / 1000).replace(".", ",") + "×";
}
$("speedForm").onsubmit = (e) => {
  if (e.submitter?.value !== "apply") return;
  e.preventDefault();
  try {
    const speed = Timeline.parseSpeed($("speedDialogValue").value);
    if (changeSpeed(speed)) $("speedDialog").close();
  } catch (error) {
    $("speedError").textContent = error.message;
  }
};
function changeSpeed(speed) {
  if (!selection.size) return;
  pause();
  try {
    const ids = [...selection];
    const next = Timeline.retime(project, ids, speed);
    if (JSON.stringify(next) === JSON.stringify(project)) return true;
    checkpoint();
    project = next;
    selection = new Set(ids);
    resetPlayers();
    changed();
    return true;
  } catch (e) {
    toast(e.message);
    properties();
  }
}
$("clipSpeed").onchange = () => {
  try {
    changeSpeed(Timeline.parseSpeed($("clipSpeed").value));
  } catch (e) {
    toast(e.message);
    properties();
  }
};
$("resetSpeed").onclick = () => changeSpeed(null);
$("selectSourceSegments").onclick = () =>
  selectIds(Timeline.familyIds(project, [...selection]));
$("lockAspect").onchange = () =>
  edit((c) => {
    c.aspectUnlocked = !$("lockAspect").checked;
  });
$("clipVolume").onchange = () =>
  edit((c) => {
    c.volume = Number($("clipVolume").value) / 100;
  });
for (const id of ["layoutX", "layoutY", "layoutW", "layoutH"])
  $(id).onchange = () =>
    edit((c) => {
      c.layout = {
        ...(c.layout || {}),
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
        shape: $("effectShape").value,
        strength: Number($("effectStrength").value),
        x: Number($("effectX").value),
        y: Number($("effectY").value),
        width: Number($("effectW").value),
        height: Number($("effectH").value),
      };
      if (
        c.effect.shape === "circle" &&
        (id === "effectW" || id === "effectH")
      ) {
        const size = Timeline.projectSize(project),
          e = c.effect;
        if (id === "effectH") e.width = (e.height * size.height) / size.width;
        else e.height = (e.width * size.width) / size.height;
        const factor = Math.min(
          1,
          (100 - e.x) / e.width,
          (100 - e.y) / e.height,
        );
        e.width *= factor;
        e.height *= factor;
      }
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
  let ids;
  try {
    ids = Timeline.splitTargets(project.clips, [...selection], time);
  } catch (error) {
    return toast(error.message);
  }
  const linked = new Set(
    selected()
      .map((c) => c.linkId)
      .filter(Boolean),
  );
  if (!ids.length && !linked.size) return;
  pause();
  const before = JSON.stringify(project);
  const newIds = [];
  const joined = new Set(
    project.clips
      .filter((c) => ids.includes(c.id))
      .map((c) => c.groupId)
      .filter(Boolean),
  );
  for (const c of project.clips)
    if (joined.has(c.groupId)) delete c.joinedSegments;
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
  const rightSelection = [];
  for (const link of linked) {
    const members = project.clips.filter((c) => c.linkId === link),
      left = members.filter((c) => c.start < time - 1e-8),
      right = members.filter((c) => c.start >= time - 1e-8);
    if (left.length && right.length) {
      const rightLink = uid(),
        joins = new Map();
      for (const c of right) {
        c.linkId = rightLink;
        if (c.groupId) {
          if (!joins.has(c.groupId)) joins.set(c.groupId, uid());
          c.groupId = joins.get(c.groupId);
        }
        rightSelection.push(c.id);
      }
      count++;
    }
  }
  if (!count)
    return toast("Posiziona la linea verde dentro le clip selezionate.");
  history.push(before);
  future = [];
  selection = new Set(
    rightSelection.length ? rightSelection : groupMembers([...ids, ...newIds]),
  );
  changed();
}
function remove() {
  if (!selection.size) return;
  pause();
  try {
    const next = Timeline.deleteFamilySegments(
      project,
      [...selection],
      rippleFamily,
    );
    checkpoint();
    project = next;
  } catch (error) {
    return toast(error.message);
  }
  selection.clear();
  changed();
}
function copyTimelineSelection() {
  try {
    timelineClipboard = Timeline.copySelection(project, [...selection]);
    toast(`${timelineClipboard.clips.length} elementi copiati`);
  } catch (error) {
    toast(error.message);
  }
}
function cutTimelineSelection() {
  if (!selection.size) return;
  try {
    const result = Timeline.cutSelection(project, groupMembers([...selection]));
    pause();
    checkpoint();
    timelineClipboard = result.clipboard;
    project = result.project;
    selection.clear();
    changed(true);
  } catch (error) {
    toast(error.message);
  }
}
function pasteTimelineSelection() {
  try {
    const result = Timeline.pasteSelection(
      project,
      timelineClipboard,
      time,
      Number($("activeTrack").value),
      uid,
    );
    pause();
    checkpoint();
    project = result.project;
    selection = new Set(result.ids);
    resetPlayers();
    render();
    for (const m of project.media) if (!waves.has(m.id)) requestWave(m);
  } catch (error) {
    toast(error.message);
  }
}
function joinSelected() {
  if (selection.size < 2)
    return toast("Seleziona almeno due clip con Ctrl/Shift + clic.");
  editGroup(true);
}
function editGroup(join) {
  pause();
  checkpoint();
  if (join) Timeline.groupSelected(project.clips, [...selection], uid);
  else
    for (const c of selected()) {
      delete c.groupId;
      delete c.joinedSegments;
    }
  changed();
}
function group() {
  if (selection.size < 2)
    return toast("Seleziona almeno due elementi da raggruppare.");
  pause();
  checkpoint();
  Timeline.linkSelected(project.clips, [...selection], uid);
  changed();
}
function unlinkGroup() {
  if (!selection.size) return;
  pause();
  checkpoint();
  for (const c of project.clips.filter((c) =>
    groupMembers([...selection]).includes(c.id),
  ))
    delete c.linkId;
  changed();
}
$("linkTool").onclick = group;
$("groupTool").onclick = joinSelected;
$("splitBtn").onclick = split;
$("cutTool").onclick = split;
$("deleteBtn").onclick = remove;
$("deleteTool").onclick = remove;
$("undoBtn").onclick = () => undo(history, future);
$("redoBtn").onclick = () => undo(future, history);
function detachSelectedAudio() {
  const c = first();
  if (!c) return;
  try {
    const result = Timeline.detachAudio(project, c.id, uid);
    pause();
    checkpoint();
    project = result.project;
    selection = new Set([result.audioId]);
    const audio = first(),
      m = mediaOf(audio),
      original = project.media.find((x) => x.path === m.path && x.id !== m.id);
    if (original && waves.has(original.id))
      waves.set(m.id, waves.get(original.id));
    else requestWave(m);
    resetPlayers();
    render();
  } catch (error) {
    toast(error.message);
  }
}
function trackPadding(height) {
  return Math.min(8, Math.max(2, Math.round(height * 0.08)));
}
let trackGeometryFrame = null,
  trackHeightEditing = false;
function syncTrackHeightControl() {
  const heights = project.trackHeights || [],
    value =
      heights.length && heights.every((h) => h === heights[0])
        ? heights[0]
        : (project.defaultTrackHeight ?? 100);
  $("trackHeight").value = value;
  $("trackHeightValue").textContent = value;
}
function applyTrackGeometry() {
  trackGeometryFrame = null;
  syncTrackHeightControl();
  for (let track = 0; track < Timeline.trackCount(project); track++) {
    const height = project.trackHeights[track],
      row = $("track" + track),
      label = document.querySelector('[data-choose-track="' + track + '"]');
    if (!row || !label) continue;
    row.style.height = label.style.height = height + "px";
    label.classList.toggle("compact-track", height < 64);
    for (const block of Timeline.groups(project.clips).filter(
      (b) => b.track === track,
    )) {
      const node = [...row.children].find(
        (n) => n.dataset.id === block.members[0].id,
      );
      if (!node) continue;
      const padding = trackPadding(height);
      node.style.height = height - 2 * padding + "px";
      node.style.top = padding + "px";
      node.classList.toggle("compact-track", height < 64);
      node.querySelector("canvas")?.remove();
      drawWave(node, block);
    }
  }
}
function scheduleTrackGeometry() {
  if (trackGeometryFrame === null)
    trackGeometryFrame = requestAnimationFrame(applyTrackGeometry);
}
function setAllTrackHeights(value, finish = false) {
  value = Math.max(Timeline.MIN_TRACK_HEIGHT, Math.min(600, Number(value)));
  if (
    project.defaultTrackHeight === value &&
    project.trackHeights.every((h) => h === value)
  ) {
    if (finish) trackHeightEditing = false;
    return;
  }
  if (!trackHeightEditing) {
    pause();
    checkpoint();
    trackHeightEditing = true;
  }
  project.defaultTrackHeight = value;
  project.trackHeights = Array(Timeline.trackCount(project)).fill(value);
  $("trackHeight").value = value;
  $("trackHeightValue").textContent = value;
  scheduleTrackGeometry();
  if (finish) trackHeightEditing = false;
  $("undoBtn").disabled = false;
  $("redoBtn").disabled = true;
}
$("trackHeight").oninput = () => setAllTrackHeights($("trackHeight").value);
$("trackHeight").onchange = () => {
  trackHeightEditing = false;
  applyTrackGeometry();
};
$("trackHeightMinus").onclick = () =>
  setAllTrackHeights(Number($("trackHeight").value) - 8, true);
$("trackHeightPlus").onclick = () =>
  setAllTrackHeights(Number($("trackHeight").value) + 8, true);
let contextTrack = null;
function showTrackContext(e, track) {
  e.preventDefault();
  e.stopPropagation();
  $("contextMenu").hidden = true;
  contextTrack = track;
  $("activeTrack").value = track;
  $("pasteTrack").disabled = !timelineClipboard;
  const menu = $("trackContextMenu");
  $("deleteTrack").textContent = "Elimina traccia " + (track + 1);
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - 210) + "px";
  menu.style.top = Math.min(e.clientY, innerHeight - 50) + "px";
}
function deleteTimelineTrack(track) {
  pause();
  checkpoint();
  const active = Number($("activeTrack").value);
  Timeline.removeTrack(project, track);
  selection = new Set(
    [...selection].filter((id) => project.clips.some((c) => c.id === id)),
  );
  resetPlayers();
  changed();
  $("activeTrack").value = Math.min(
    active > track ? active - 1 : active,
    Timeline.trackCount(project) - 1,
  );
}
$("pasteTrack").onclick = () => {
  $("trackContextMenu").hidden = true;
  pasteTimelineSelection();
};
$("deleteTrack").onclick = () => {
  $("trackContextMenu").hidden = true;
  const count = project.clips.filter((c) => c.track === contextTrack).length;
  if (!count) return deleteTimelineTrack(contextTrack);
  $("deleteTrackMessage").textContent =
    `Eliminare la traccia ${contextTrack + 1} e le sue ${count} clip? I file originali rimangono nella libreria. Puoi annullare l’eliminazione con Annulla.`;
  $("deleteTrackDialog").showModal();
};
$("deleteTrackForm").onsubmit = (e) => {
  if (e.submitter?.value === "delete") deleteTimelineTrack(contextTrack);
};
window.addEventListener("pointerdown", (e) => {
  if (!$("trackContextMenu").contains(e.target))
    $("trackContextMenu").hidden = true;
});
function showContext(x, y) {
  $("trackContextMenu").hidden = true;
  const menu = $("contextMenu");
  const c = first(),
    m = c && mediaOf(c);
  if (c) $("activeTrack").value = c.track;
  menu.querySelector('[data-action="paste"]').disabled = !timelineClipboard;
  menu.querySelector('[data-action="detach-audio"]').disabled = !(
    c &&
    m.kind === "video" &&
    m.hasAudio &&
    !c.audioDetached
  );
  const mute = menu.querySelector('[data-action="mute"]');
  mute.disabled = !(c && m.hasAudio && !c.audioDetached);
  mute.textContent = c?.muted ? "Riattiva audio clip" : "Silenzia audio clip";
  $("contextSpeedValue").textContent = speedLabel(first()?.speed || 1);
  menu.hidden = false;
  menu.style.left =
    Math.max(4, Math.min(x, innerWidth - menu.offsetWidth - 4)) + "px";
  menu.style.top =
    Math.max(4, Math.min(y, innerHeight - menu.offsetHeight - 4)) + "px";
}
for (const button of $("contextMenu").querySelectorAll("button"))
  button.onclick = () => {
    const a = button.dataset.action;
    $("contextMenu").hidden = true;
    if (a === "cut") cutTimelineSelection();
    if (a === "join") joinSelected();
    if (a === "unjoin") editGroup(false);
    if (a === "copy") copyTimelineSelection();
    if (a === "paste") pasteTimelineSelection();
    if (a === "split") split();
    if (a === "group") group();
    if (a === "ungroup") unlinkGroup();
    if (a === "source-speed") {
      selection = new Set(Timeline.familyIds(project, [...selection]));
      renderTimeline();
      properties();
    }
    if (a === "set-speed" || a === "source-speed") {
      $("speedDialogValue").value = first()?.speed || 1;
      $("speedError").textContent = "";
      $("speedDialog").showModal();
      $("speedDialogValue").select();
    }
    if (a === "speed") changeSpeed(null);
    if (a === "detach-audio") detachSelectedAudio();
    if (a === "mute") {
      const muted = !first()?.muted;
      edit((c) => {
        if (mediaOf(c).hasAudio && !c.audioDetached) c.muted = muted;
      });
    }
    if (a === "delete") remove();
  };
window.addEventListener("pointerdown", (e) => {
  if (!$("contextMenu").contains(e.target)) $("contextMenu").hidden = true;
});
function updateHead() {
  const duration = Timeline.total(project.clips);
  $("projectSeek").max = String(duration);
  $("projectSeek").value = String(time);
  $("projectSeekTime").textContent = fmt(time) + " / " + fmt(duration);

  $("playhead").style.left = time * scale + "px";
  $("timecode").textContent = fmt(time) + " / " + fmt(duration);
}
function revealHead() {
  const sc = $("timelineScroll"),
    x = time * scale;
  if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 25)
    sc.scrollLeft = Math.max(0, x - 30);
}
function seek(t, scrub = false) {
  const resume = playing;
  if (playing || preparing) pause();
  if (scrub) markPreviewScrubbing();
  time = Math.max(0, Math.min(Timeline.total(project.clips), t));
  requestPreviewPaint(true);
  updateHead();
  revealHead();
  if (resume) play();
}
function previewTime() {
  const end = Timeline.total(project.clips);
  return end > 0 && time >= end ? end - 0.0001 : time;
}
function videoKey(c, m) {
  return JSON.stringify([
    m.id,
    c.track,
    c.speed || 1,
    Math.round((c.in - c.start * (c.speed || 1)) * 1e8) / 1e8,
  ]);
}
function syncPlayers(force = false) {
  const pt = previewTime(),
    active = Timeline.active(project.clips, pt),
    activeIds = new Set(active.map((c) => c.id));
  const upcoming = project.clips.filter(
    (c) => c.start > pt && c.start < pt + 2 && mediaOf(c).kind === "video",
  );
  const wanted = [...active, ...upcoming],
    used = new Set();
  players.clear();
  for (const c of wanted) {
    const m = mediaOf(c);
    if (!["video", "image"].includes(m.kind)) continue;
    const key = videoKey(c, m);
    let p = videoPool.get(key);
    if (!p) {
      const element =
        m.kind === "image" ? new Image() : document.createElement("video");
      element.preload = "auto";
      element.muted = true;
      p = { element, kind: m.kind, error: false, key };
      videoPool.set(key, p);
      if (m.kind === "video")
        p.seeker = new LatestVideoSeek(
          element,
          () => {
            if (videoPool.get(key) !== p) return;
            rememberVideoFrame(p);
            requestPreviewPaint();
          },
          window,
          () => rememberVideoFrame(p),
        );
      element.onload = () => requestPreviewPaint();
      element.onerror = () => {
        p.error = true;
        toast("Anteprima non disponibile: " + m.name);
        requestPreviewPaint();
      };
      element.src = m.url;
    }
    p.used = performance.now();
    players.set(c.id, p);
    if (used.has(key)) continue;
    used.add(key);
    if (m.kind === "image") continue;
    const v = p.element,
      at = activeIds.has(c.id) ? Timeline.sourceTime(c, pt) : c.in;
    v.muted = true;
    v.volume = 0;
    v.playbackRate = c.speed || 1;
    p.seeker.request(at, playing ? 0.08 : 0.002);
    if (playing && activeIds.has(c.id) && v.paused && !p.error)
      v.play().catch((e) => {
        if (e.name !== "AbortError") toast("Video: " + e.message);
      });
    if (!playing || !activeIds.has(c.id)) v.pause();
  }
  for (const [key, p] of videoPool) {
    if (!used.has(key)) {
      p.element.pause?.();
      if (videoPool.size > Math.max(8, used.size)) {
        p.seeker?.dispose();
        p.element.onload = p.element.onerror = null;
        p.element.removeAttribute("src");
        p.element.load?.();
        videoPool.delete(key);
      }
    }
  }
}
async function readyVideos() {
  syncPlayers(true);
  const needed = [
    ...new Set(
      Timeline.active(project.clips, previewTime())
        .map((c) => players.get(c.id))
        .filter((p) => p?.kind === "video"),
    ),
  ];
  await Promise.all(
    needed.map(
      (p) =>
        new Promise((resolve, reject) => {
          const v = p.element;
          let timer;
          const cleanup = () => {
            clearTimeout(timer);
            v.removeEventListener("seeked", check);
            v.removeEventListener("loadeddata", check);
            v.removeEventListener("error", fail);
          };
          const check = () => {
            if (p.seeker.atTarget) {
              cleanup();
              resolve();
            }
          };
          const fail = () => {
            cleanup();
            reject(Error("Il video non è pronto: controlla il file sorgente."));
          };
          v.addEventListener("seeked", check);
          v.addEventListener("loadeddata", check);
          v.addEventListener("error", fail);
          timer = setTimeout(fail, 15000);
          check();
        }),
    ),
  );
}
function previewRect() {
  const cv = $("previewCanvas"),
    r = cv.getBoundingClientRect(),
    k = Math.min(r.width / cv.width, r.height / cv.height),
    width = cv.width * k,
    height = cv.height * k;
  return {
    left: r.left + (r.width - width) / 2,
    top: r.top + (r.height - height) / 2,
    width,
    height,
  };
}
function annotationBox(a) {
  const size = Timeline.projectSize(project);
  if (a.type === "text") {
    const ctx = $("previewCanvas").getContext("2d");
    ctx.font = `${(a.size * size.height) / 1080}px "${a.font}"`;
    const lines = Scene.wrap(ctx, a.text, ((a.width || 80) / 100) * size.width);
    return {
      x: a.x - (a.width || 80) / 2,
      y: a.y - ((lines.length * a.size * 1.25) / 1080) * 50,
      width: a.width || 80,
      height: Math.max(1, ((lines.length * a.size * 1.25) / 1080) * 100),
    };
  }
  const pad = (Math.max(a.lineWidth, 18) / 1080) * 100;
  if (a.type === "circle")
    return {
      x: a.x - (a.length * size.height) / size.width / 2 - pad,
      y: a.y - a.length / 2 - pad,
      width: (a.length * size.height) / size.width + 2 * pad,
      height: a.length + 2 * pad,
    };
  const r = (a.angle * Math.PI) / 180,
    ex = a.x + Math.cos(r) * a.length,
    ey = a.y + (Math.sin(r) * a.length * size.width) / size.height;
  return {
    x: Math.min(a.x, ex) - pad,
    y: Math.min(a.y, ey) - pad,
    width: Math.max(1, Math.abs(ex - a.x)) + 2 * pad,
    height: Math.max(1, Math.abs(ey - a.y)) + 2 * pad,
  };
}
function mediaContent(c) {
  if (c.layout?.content) return c.layout.content;
  const m = mediaOf(c),
    l = c.layout || { width: 100, height: 100 },
    size = Timeline.projectSize(project),
    player = players.get(c.id)?.element;
  const sw =
      m.width || player?.videoWidth || player?.naturalWidth || size.width,
    sh =
      m.height || player?.videoHeight || player?.naturalHeight || size.height;
  const fw = (size.width * l.width) / 100,
    fh = (size.height * l.height) / 100,
    k = Math.min(fw / sw, fh / sh);
  const width = Math.min(100, ((sw * k) / fw) * 100),
    height = Math.min(100, ((sh * k) / fh) * 100);
  return { x: (100 - width) / 2, y: (100 - height) / 2, width, height };
}
function previewBox(c) {
  const m = mediaOf(c);
  if (m.kind === "effect") return { ...c.effect, type: "effect" };
  if (m.kind === "audio") return null;
  const l = c.layout || { x: 0, y: 0, width: 100, height: 100 };
  const b = c.annotation
    ? annotationBox(c.annotation)
    : m.kind === "image"
      ? mediaContent(c)
      : { x: 0, y: 0, width: 100, height: 100 };
  return {
    x: l.x + (b.x * l.width) / 100,
    y: l.y + (b.y * l.height) / 100,
    width: (b.width * l.width) / 100,
    height: (b.height * l.height) / 100,
    type: "visual",
  };
}
function boxHandles(b) {
  return [
    ["nw", b.x, b.y],
    ["n", b.x + b.width / 2, b.y],
    ["ne", b.x + b.width, b.y],
    ["e", b.x + b.width, b.y + b.height / 2],
    ["se", b.x + b.width, b.y + b.height],
    ["s", b.x + b.width / 2, b.y + b.height],
    ["sw", b.x, b.y + b.height],
    ["w", b.x, b.y + b.height / 2],
  ];
}
function hitHandle(box, x, y) {
  if (!box) return null;
  const r = previewRect();
  return (
    boxHandles(box).find(
      ([, hx, hy]) =>
        Math.abs(x - hx) < (9 / r.width) * 100 &&
        Math.abs(y - hy) < (9 / r.height) * 100,
    )?.[0] || null
  );
}
function draw() {
  const cv = $("previewCanvas"),
    ctx = cv.getContext("2d"),
    pt = previewTime(),
    active = Timeline.active(Timeline.expanded(project).clips, pt);
  $("stageEmpty").hidden = project.clips.length > 0;
  // Hold the previous composition while a newly entered source has no frame.
  // Empty timeline gaps still render black normally.
  if (
    active.some((c) => {
      const m = mediaOf(c),
        p = players.get(c.id);
      if (!["image", "video"].includes(m.kind) || p?.error) return false;
      if (!p) return true;
      if (m.kind === "image")
        return !p.element.complete || !p.element.naturalWidth;
      return !p.lastFrame && (p.element.seeking || p.element.readyState < 2);
    })
  )
    return;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cv.width, cv.height);
  Scene.release(new Set(active.map((c) => c.id)));
  for (const c of active) {
    const m = mediaOf(c),
      p = players.get(c.id);
    if (m.kind === "effect") {
      Scene.effect(ctx, c.effect, cv.width, cv.height, c.id);
      continue;
    }
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
    else if (p && !p.error) {
      const source =
        m.kind === "image"
          ? p.element
          : !p.element.seeking && p.element.readyState >= 2
            ? p.element
            : p.lastFrame;
      if (source)
        Scene.draw(
          ctx,
          c,
          m,
          source,
          Timeline.sourceTime(c, pt),
          cv.width,
          cv.height,
        );
    }
  }
  const c = first();
  if (c && time >= c.start && time < c.start + Timeline.duration(c)) {
    const box = previewBox(c);
    if (box) {
      const x = (box.x * cv.width) / 100,
        y = (box.y * cv.height) / 100,
        w = (box.width * cv.width) / 100,
        h = (box.height * cv.height) / 100;
      ctx.save();
      ctx.strokeStyle = "#b4ed70";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#b4ed70";
      const r = previewRect(),
        hw = (8 / r.width) * cv.width,
        hh = (8 / r.height) * cv.height;
      for (const [, hx, hy] of boxHandles(box))
        ctx.fillRect(
          (hx / 100) * cv.width - hw / 2,
          (hy / 100) * cv.height - hh / 2,
          hw,
          hh,
        );
      ctx.restore();
    }
  }
}
function pause() {
  if (playing) time = transport.time();
  transport.stop();
  playing = false;
  preparing = false;
  cancelAnimationFrame(frame);
  for (const p of videoPool.values()) p.element.pause?.();
  $("playBtn").textContent = "▶";
}
async function play() {
  finishPreviewScrubbing();
  if (!project.clips.length) return;
  if (time >= Timeline.total(project.clips)) time = 0;
  if (preparing) return;
  preparing = true;
  $("playBtn").textContent = "…";
  try {
    const started = await transport.start(project, time, readyVideos);
    if (!started) return;
    preparing = false;
    playing = true;
    $("playBtn").textContent = "Ⅱ";
    syncPlayers();
    frame = requestAnimationFrame(tick);
  } catch (e) {
    pause();
    toast("Riproduzione non avviata: " + e.message);
  }
}
function tick() {
  if (!playing) return;
  time = transport.time();
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
$("playBtn").onclick = () => (playing || preparing ? pause() : play());
$("toStart").onclick = () => seek(0);
$("toEnd").onclick = () => seek(Timeline.total(project.clips));
let panView = false;
$("panPreview").onclick = () => {
  panView = !panView;
  $("panPreview").setAttribute("aria-pressed", String(panView));
  $("previewCanvas").style.cursor = panView ? "grab" : "move";
};
$("previewCanvas").onpointerdown = (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  const stage = document.querySelector(".stage");
  if (e.button === 1 || panView) {
    e.preventDefault();
    const x = e.clientX,
      y = e.clientY,
      left = stage.scrollLeft,
      top = stage.scrollTop;
    captureMove(e, (ev) => {
      stage.scrollLeft = left + x - ev.clientX;
      stage.scrollTop = top + y - ev.clientY;
    });
    return;
  }
  e.preventDefault();
  pause();
  const r = previewRect(),
    x = ((e.clientX - r.left) / r.width) * 100,
    y = ((e.clientY - r.top) / r.height) * 100;
  let c = first();
  if (c && (time < c.start || time >= c.start + Timeline.duration(c))) c = null;
  let box = c && previewBox(c),
    handle = c && hitHandle(box, x, y);
  if (!handle) {
    c = Timeline.active(Timeline.expanded(project).clips, previewTime())
      .reverse()
      .find((item) => {
        const b = previewBox(item);
        return (
          b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
        );
      });
    if (!c) {
      selection.clear();
      renderTimeline();
      properties();
      draw();
      return;
    }
    c = Timeline.allClips(project).find((item) => item.id === c.id) || c;
    selectIds([c.id]);
    previewFocus = c.id;
    properties();
    draw();
    box = previewBox(c);
  }
  const old = clone(c),
    initial = clone(box);
  let dirty = false;
  captureMove(
    e,
    (ev) => {
      const dx = ((ev.clientX - e.clientX) / r.width) * 100,
        dy = ((ev.clientY - e.clientY) / r.height) * 100;
      if (!dirty && Math.abs(dx) + Math.abs(dy) < 0.05) return;
      if (!dirty) {
        checkpoint();
        dirty = true;
      }
      const next = handle
        ? Timeline.resizeBox(
            initial,
            handle,
            dx,
            dy,
            mediaOf(c).kind === "effect"
              ? c.effect?.shape === "circle"
              : !c.aspectUnlocked,
          )
        : snapPreviewBox(
            { ...initial, x: initial.x + dx, y: initial.y + dy },
            r,
          );
      if (handle) $("alignGuides").replaceChildren();
      if (handle && !c.aspectUnlocked && mediaOf(c).kind !== "effect") {
        const original =
          mediaOf(c).kind === "effect"
            ? old.effect
            : old.layout || { width: 100, height: 100 };
        const max = mediaOf(c).kind === "effect" ? 100 : 200;
        const factor = Math.max(
          1 / original.width,
          1 / original.height,
          Math.min(
            next.width / initial.width,
            max / original.width,
            max / original.height,
          ),
        );
        const limited = Timeline.resizeBox(
          initial,
          handle,
          (factor - 1) * initial.width * (handle.includes("w") ? -1 : 1),
          (factor - 1) * initial.height * (handle.includes("n") ? -1 : 1),
          true,
        );
        Object.assign(next, limited);
      }
      if (mediaOf(c).kind === "effect") {
        const width = Math.min(100, Math.max(1, next.width)),
          height = Math.min(100, Math.max(1, next.height));
        c.effect = {
          ...old.effect,
          x: Math.max(0, Math.min(100 - width, next.x)),
          y: Math.max(0, Math.min(100 - height, next.y)),
          width,
          height,
        };
      } else {
        const l = old.layout || { x: 0, y: 0, width: 100, height: 100 };
        const base = c.annotation
          ? annotationBox(old.annotation)
          : mediaOf(c).kind === "image"
            ? mediaContent(old)
            : { x: 0, y: 0, width: 100, height: 100 };
        const width = Math.min(
            200,
            Math.max(1, (l.width * next.width) / initial.width),
          ),
          height = Math.min(
            200,
            Math.max(1, (l.height * next.height) / initial.height),
          );
        c.layout = {
          x: Math.max(-100, Math.min(100, next.x - (base.x * width) / 100)),
          y: Math.max(-100, Math.min(100, next.y - (base.y * height) / 100)),
          width,
          height,
          ...(!c.annotation ? { content: mediaContent(old) } : {}),
        };
      }
      properties();
      draw();
    },
    (ev) => {
      $("alignGuides").replaceChildren();
      if (ev.type === "pointercancel" && dirty) {
        delete c.layout;
        Object.assign(c, old);
      }
      if (dirty) {
        $("undoBtn").disabled = !history.length;
        $("redoBtn").disabled = !future.length;
      }
    },
  );
};
$("saveProject").onclick = safe(() => saveCurrent());
$("openProject").onclick = safe(() =>
  transitionProject(async () => {
    const data = await studio.openProject();
    if (data) applyOpened(data);
  }),
);
const defaultKeys = {
  split: ["s", "h"],
  play: ["space"],
  delete: ["delete", "backspace"],
};
const normalizeShortcut = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/\s*\+\s*/g, "+")
    .replace(/^canc$/, "delete")
    .replace(/^spazio$/, "space");
for (const action of Object.keys(defaultKeys)) {
  const old = keys[action];
  keys[action] = Array.isArray(old)
    ? old.map(normalizeShortcut)
    : old === " "
      ? ["space"]
      : old
        ? [normalizeShortcut(old)]
        : defaultKeys[action];
}
// Adopt helpful alternate defaults when migrating the previous single-key defaults.
if (keys.split.length === 1 && keys.split[0] === "s") keys.split.push("h");
if (keys.delete.length === 1 && keys.delete[0] === "delete")
  keys.delete.push("backspace");
function eventShortcut(e) {
  return [
    e.ctrlKey || e.metaKey ? "ctrl" : null,
    e.altKey ? "alt" : null,
    e.shiftKey ? "shift" : null,
    e.key === " " ? "space" : e.key.toLowerCase(),
  ]
    .filter(Boolean)
    .join("+");
}
function showKeys() {
  for (const action of Object.keys(defaultKeys))
    $("key" + action[0].toUpperCase() + action.slice(1)).value = keys[action]
      .map((k) => (k === "delete" ? "Canc" : k === "space" ? "Spazio" : k))
      .join("; ");
}
$("keysBtn").onclick = () => {
  showKeys();
  $("keysDialog").showModal();
};
for (const action of Object.keys(defaultKeys))
  $("key" + action[0].toUpperCase() + action.slice(1)).onchange = safe(() => {
    const field = $("key" + action[0].toUpperCase() + action.slice(1)),
      values = [
        ...new Set(
          field.value.split(";").map(normalizeShortcut).filter(Boolean),
        ),
      ];
    if (!values.length) throw Error("Indica almeno un tasto");
    const reserved = [
      "ctrl+s",
      "ctrl+shift+s",
      "ctrl+o",
      "ctrl+n",
      "ctrl+w",
      "ctrl+z",
      "ctrl+shift+z",
      "ctrl+c",
      "ctrl+x",
      "ctrl+v",
      "ctrl+a",
      "ctrl+g",
      "ctrl+shift+g",
    ];
    for (const value of values) {
      if (reserved.includes(value))
        throw Error("Combinazione riservata: " + value);
      if (
        Object.entries(keys).some(
          ([other, list]) => other !== action && list.includes(value),
        )
      )
        throw Error("Tasto già assegnato: " + value);
    }
    keys[action] = values;
    localStorage.setItem("crea-keys", JSON.stringify(keys));
    showKeys();
  });
$("resetKeys").onclick = () => {
  keys = clone(defaultKeys);
  localStorage.setItem("crea-keys", JSON.stringify(keys));
  showKeys();
};
let activePropertyField = null;
document.querySelector(".properties").addEventListener("focusin", (e) => {
  if (e.target.matches("input,select,textarea")) activePropertyField = e.target;
});
$("applyProperties").onclick = () => {
  if (
    activePropertyField &&
    !activePropertyField.disabled &&
    activePropertyField.getClientRects().length
  )
    activePropertyField.dispatchEvent(new Event("change", { bubbles: true }));
};
document.addEventListener(
  "keydown",
  (e) => {
    if (
      e.key !== "Enter" ||
      e.isComposing ||
      e.target.tagName === "TEXTAREA" ||
      e.target.isContentEditable
    )
      return;
    const field = e.target;
    if (!field.matches("input,select")) return;
    const dialog = field.closest("dialog");
    if (dialog?.id === "speedDialog") {
      e.preventDefault();
      e.stopImmediatePropagation();
      $("speedForm").requestSubmit(
        $("speedForm").querySelector('[value="apply"]'),
      );
      return;
    }
    if (dialog?.id === "settingsDialog") {
      e.preventDefault();
      e.stopImmediatePropagation();
      $("saveSettings").click();
      return;
    }
    if (
      field.closest(".properties") ||
      ["recordDialog", "exportDialog", "keysDialog"].includes(dialog?.id)
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  },
  true,
);
document.onkeydown = (e) => {
  if ($("appDialog").open) return;
  if (
    (e.ctrlKey || e.metaKey) &&
    ["n", "o", "w"].includes(e.key.toLowerCase()) &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    if (e.key.toLowerCase() === "o") $("openProject").click();
    else safe(() => transitionProject(emptyWorkspace))();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !exportBusy) {
    e.preventDefault();
    document.activeElement.blur();
    e.shiftKey ? safe(() => saveCurrent(true))() : $("saveProject").click();
    return;
  }
  if (
    document.querySelector("dialog[open]") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    e.target.isContentEditable
  )
    return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if ((e.ctrlKey || e.metaKey) && ["c", "v", "x"].includes(k)) {
    e.preventDefault();
    if (k === "c") copyTimelineSelection();
    else if (k === "x") cutTimelineSelection();
    else pasteTimelineSelection();
    return;
  }
  const match = Object.keys(keys).find((action) =>
    keys[action].includes(eventShortcut(e)),
  );
  if (match) {
    e.preventDefault();
    if (match === "split") split();
    else if (match === "delete") remove();
    else playing || preparing ? pause() : play();
    return;
  }
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
      e.shiftKey ? unlinkGroup() : group();
    }
    return;
  }
};
async function exportProject(settings) {
  const output = Timeline.expanded(clone(project));
  output.rasters = {};
  const { width: W, height: H } = Timeline.outputSize(project, settings.height);
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
      Scene.draw(ctx, c, mediaOf(c), null, i / fps, W, H);
      frames.push(cv.toDataURL("image/png"));
    }
    output.rasters[c.id] = { fps, frames };
  }
  return output;
}
const exportPreferenceFields = [
  "exportHeight",
  "exportFps",
  "exportPreset",
  "exportQuality",
  "exportEncoder",
  "exportCpuPreset",
  "exportKeyframe",
  "preserveOriginal",
  "exportFilename",
];
let savedExportPreferences = {};
try {
  savedExportPreferences = JSON.parse(
    localStorage.getItem("akhbar-export") || "{}",
  );
} catch {}
function saveExportPreferences() {
  for (const id of exportPreferenceFields) {
    const field = $(id);
    savedExportPreferences[id] =
      field.type === "checkbox" ? field.checked : field.value;
  }
  localStorage.setItem("akhbar-export", JSON.stringify(savedExportPreferences));
}
function updateExportControls() {
  const copy = $("preserveOriginal").checked;
  $("exportCustomQuality").hidden = false;
  $("exportQualityValue").textContent = $("exportQuality").value + "%";
  $("exportCpuControl").hidden = $("exportEncoder").value !== "cpu" || copy;
  $("exportCopyNotice").hidden = !copy;
  $("exportPreset").disabled = copy;
  $("exportQuality").disabled = copy;
}
function setExportBusy(busy) {
  exportBusy = busy;
  $("exportSettings").disabled = busy;
  for (const id of ["doExport", "exportClose", "exportCloseTop"])
    $(id).disabled = busy;
  $("cancelExport").hidden = !busy;
  updateExportControls();
}
function showExportTarget() {
  const folder = $("exportDirectory").value,
    name = $("exportFilename").value;
  $("exportDirectory").title = folder;
  const sep = folder.includes("\\") ? "\\" : "/";
  $("exportPath").textContent =
    exportOutputPath || folder.replace(/[\\/]+$/, "") + sep + name;
}
$("exportBtn").onclick = () => {
  if (!project.clips.length) return toast("Aggiungi una clip.");
  pause();
  updatePreviewView();
  if (!$("exportDirectory").value)
    $("exportDirectory").value = workspacePrefs.exports || "";
  showExportTarget();
  updateExportControls();
  $("exportAdvanced").open = false;
  $("exportTechnical").open = false;
  $("exportDialog").showModal();
};
$("exportQuality").oninput = () => {
  $("exportPreset").value = "custom";
  updateExportControls();
};
studio.onProgress((p) => {
  $("exportProgress").value = p.percent;
  $("exportPercent").textContent = p.percent + "%";
  if (p.encoder)
    $("exportEngine").textContent =
      `Encoder: ${p.encoder} · Decoder: ${p.decoder || "CPU"} · Percorso: ${p.path || "in preparazione"}${p.fallbackFrom ? " · Ripiego da " + p.fallbackFrom : ""}`;
  $("exportStatus").textContent = p.message || "Esportazione in corso…";
});
$("exportDialog").oncancel = (e) => {
  if (exportBusy) e.preventDefault();
};
$("exportDialog").onsubmit = (e) => {
  if (exportBusy) e.preventDefault();
};
$("doExport").onclick = safe(async () => {
  for (const id of ["exportFps", "exportKeyframe"])
    if (!$(id).reportValidity()) return;
  if (!$("exportFilename").value.trim() || !$("exportDirectory").value.trim())
    return toast("Indica nome file e cartella.");
  saveExportPreferences();
  $("exportResultActions").hidden = true;
  $("exportActivity").hidden = false;
  $("exportAdvanced").open = false;
  setExportBusy(true);
  const elapsedStart = performance.now();
  const paintElapsed = () =>
    ($("exportElapsed").textContent =
      "Tempo trascorso: " + fmt((performance.now() - elapsedStart) / 1000));
  paintElapsed();
  const elapsedTimer = setInterval(paintElapsed, 200);
  exportCancelled = false;
  $("exportProgress").value = 0;
  $("exportPercent").textContent = "0%";
  $("exportEngine").textContent = "Encoder da verificare all’avvio";
  try {
    const s = {
      height:
        $("exportHeight").value === "original"
          ? "original"
          : Number($("exportHeight").value),
      fps: Number($("exportFps").value),
      quality: Number($("exportQuality").value),
      encoder: $("exportEncoder").value,
      cpuPreset: $("exportCpuPreset").value,
      outputPath: exportOutputPath || undefined,
      outputDirectory: $("exportDirectory").value.trim(),
      outputName: $("exportFilename").value.trim(),
      preserveOriginal: $("preserveOriginal").checked,
      keyframeSeconds: Number($("exportKeyframe").value),
    };
    $("exportStatus").textContent = "Preparazione testi e indicatori…";
    const out = await exportProject(s);
    if (exportCancelled) throw Error("Esportazione annullata");
    const result = await studio.exportVideo(out, s);
    $("exportStatus").textContent = result
      ? "Esportazione completata"
      : "Esportazione annullata";
    if (result) {
      $("exportPath").textContent = result;
      $("exportResultActions").hidden = false;
      $("exportProgress").value = 100;
      $("exportPercent").textContent = "100%";
      toast("Video MP4 esportato.");
    }
  } catch (e) {
    $("exportStatus").textContent = e.message;
  } finally {
    paintElapsed();
    clearInterval(elapsedTimer);
    setExportBusy(false);
  }
});
$("cancelExport").onclick = () => {
  exportCancelled = true;
  $("cancelExport").disabled = true;
  $("exportStatus").textContent = "Annullamento in corso…";
  studio.cancelExport().finally(() => ($("cancelExport").disabled = false));
};
const recordFields = [
  "recordName",
  "captureSource",
  "cameraDevice",
  "recordFormat",
  "recordHeight",
  "recordFps",
  "recordAudioBitrate",
  "recordPreset",
  "recordQuality",
  "recordProfile",
  "micGain",
  "autoGain",
  "systemAudio",
  "microphone",
  "microphoneDevice",
  "audioProcessing",
];
let recordingPrefs = {};
try {
  recordingPrefs = JSON.parse(localStorage.getItem("akhbar-recording") || "{}");
} catch {}
function saveRecordingPrefs() {
  for (const id of recordFields)
    if ($(id).value !== "missing")
      recordingPrefs[id] =
        $(id).type === "checkbox" ? $(id).checked : $(id).value;
  const opt = $("microphoneDevice").selectedOptions[0];
  if (opt && opt.value !== "missing") {
    recordingPrefs.microphoneLabel = opt.textContent;
    recordingPrefs.microphoneGroup = opt.dataset.group || "";
  }
  localStorage.setItem("akhbar-recording", JSON.stringify(recordingPrefs));
}
for (const id of recordFields) {
  if (
    recordingPrefs[id] !== undefined &&
    !["captureSource", "cameraDevice", "microphoneDevice"].includes(id)
  )
    if ($(id).type === "checkbox") $(id).checked = recordingPrefs[id];
    else $(id).value = recordingPrefs[id];
  $(id).addEventListener("change", saveRecordingPrefs);
}
// Preserve an existing explicit processing preference; new recordings start with no AGC.
if (recordingPrefs.autoGain === undefined && recordingPrefs.audioProcessing)
  $("autoGain").checked = true;
$("micGain").oninput = () => {
  const gain = Number($("micGain").value);
  $("micGainValue").textContent = gain + " dB";
  if (micGainNode)
    micGainNode.gain.setTargetAtTime(
      10 ** (gain / 20),
      audioContext.currentTime,
      0.01,
    );
};
let overdub = null,
  pausedAt = 0,
  pausedMs = 0,
  micAnalyser = null,
  micAnalysers = [],
  micGainNode = null,
  stopVideoComposer = null,
  flushVideoFrame = null,
  stoppingCapture = false,
  cameraFrame = null;
$("micGain").oninput();
function elapsedRecording() {
  return (
    (performance.now() -
      startTime -
      pausedMs -
      (pausedAt ? performance.now() - pausedAt : 0)) /
    1000
  );
}
function toggleRecordingPause() {
  if (recorder?.state === "recording") {
    recorder.pause();
    pausedAt = performance.now();
  } else if (recorder?.state === "paused") {
    recorder.resume();
    pausedMs += performance.now() - pausedAt;
    pausedAt = 0;
  }
}
async function stopRecording() {
  if (!recorder || recorder.state === "inactive" || stoppingCapture) return;
  stoppingCapture = true;
  try {
    if (flushVideoFrame && recorder.state === "recording") {
      try {
        await flushVideoFrame();
      } catch (error) {
        console.warn(error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (recorder && recorder.state !== "inactive") recorder.stop();
  } finally {
    stoppingCapture = false;
  }
}
$("pauseRecording").onclick = toggleRecordingPause;
studio.onRecordingProgress((p) => {
  $("status").textContent =
    p.phase + (p.percent == null ? "…" : ` · ${p.percent}%`);
  if (p.metrics)
    console.info("AKHBAR_RECORDING_METRICS", JSON.stringify(p.metrics));
});
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
  cancelAnimationFrame(cameraFrame);
  micAnalyser = null;
  micAnalysers = [];
  micGainNode = null;
  stopVideoComposer?.();
  stopVideoComposer = null;
  flushVideoFrame = null;
  studio.recordingToolbar(null).catch(() => {});
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
    const previous =
        recordingPrefs.microphoneDevice || $("microphoneDevice").value,
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
      o.dataset.group = d.groupId;
      $("microphoneDevice").append(o);
    }
    $("deviceWarning").textContent = "";
    let savedOption = [...$("microphoneDevice").options].find(
      (o) => o.value === previous,
    );
    if (!savedOption && recordingPrefs.microphoneGroup)
      savedOption = [...$("microphoneDevice").options].find(
        (o) =>
          o.dataset.group === recordingPrefs.microphoneGroup &&
          o.textContent === recordingPrefs.microphoneLabel,
      );
    if (savedOption) $("microphoneDevice").value = savedOption.value;
    else if (previous && previous !== "default") {
      const missing = el(
        "option",
        "",
        "Non disponibile: " +
          (recordingPrefs.microphoneLabel || "microfono salvato"),
      );
      missing.value = "missing";
      $("microphoneDevice").append(missing);
      $("microphoneDevice").value = "missing";
      $("deviceWarning").textContent =
        "Il microfono salvato non è disponibile. Scegli un altro dispositivo prima di registrare.";
    }
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput",
    );
    $("cameraDevice").replaceChildren(
      new Option("Predefinita del sistema", "default"),
    );
    for (const d of cameras)
      $("cameraDevice").append(new Option(d.label || "Webcam", d.deviceId));
    if (
      [...$("cameraDevice").options].some(
        (o) => o.value === recordingPrefs.cameraDevice,
      )
    )
      $("cameraDevice").value = recordingPrefs.cameraDevice;
    else if (
      recordingPrefs.cameraDevice &&
      recordingPrefs.cameraDevice !== "default"
    ) {
      $("cameraDevice").append(
        new Option("Webcam salvata non disponibile", "missing"),
      );
      $("cameraDevice").value = "missing";
      $("deviceWarning").textContent +=
        " Webcam salvata non disponibile: scegline un’altra per le modalità con webcam.";
    }
  } finally {
    permission?.getTracks().forEach((t) => t.stop());
  }
}
$("refreshMicrophones").onclick = safe(() => microphones(true));
$("recordQuality").oninput = () => {
  $("recordQualityValue").textContent = $("recordQuality").value + "%";
};
async function showRecording(open = true) {
  if (recorder || finishing)
    return toast("Registrazione o salvataggio in corso.");
  const sources = await studio.sources();

  $("captureSource").replaceChildren();
  for (const s of sources) {
    const o = el("option", "", s.name);
    o.value = s.id;
    $("captureSource").append(o);
  }
  if (
    [...$("captureSource").options].some(
      (o) => o.value === recordingPrefs.captureSource,
    )
  )
    $("captureSource").value = recordingPrefs.captureSource;
  const windows = (await studio.platform()) === "win32";
  $("systemAudio").disabled = !windows;
  if (!windows) $("systemAudio").checked = false;
  await microphones();
  $("recordQualityValue").textContent = $("recordQuality").value + "%";
  if (open) $("recordDialog").showModal();
}
$("recordBtn").onclick = safe(showRecording);
$("railRecord").onclick = safe(showRecording);
$("startRecording").onclick = safe(async () => {
  if (
    !$("recordFps").checkValidity() ||
    !$("recordAudioBitrate").checkValidity()
  )
    return toast("Controlla FPS e bitrate audio.");
  if (
    ($("microphone").checked || overdub) &&
    $("microphoneDevice").value === "missing"
  )
    return toast("Scegli un microfono disponibile prima di registrare.");
  saveRecordingPrefs();
  $("startRecording").disabled = true;
  try {
    const settings = {
        name: $("recordName").value,
        audioOnly: !!overdub,
        format: $("recordFormat").value,
        height: Number($("recordHeight").value),
        fps: Number($("recordFps").value),
        quality: Number($("recordQuality").value),
        profile: $("recordProfile").value,
        audioBitrate: Number($("recordAudioBitrate").value),
      },
      system = $("systemAudio").checked;
    await studio.chooseSource({
      id: $("captureSource").value,
      systemAudio: system,
    });
    const mode = settings.audioOnly ? "audio" : "screen";
    const cameraId = $("cameraDevice").value;
    const camera = ["camera", "screen-camera"].includes(mode)
      ? await navigator.mediaDevices.getUserMedia({
          video: {
            ...(cameraId !== "default"
              ? { deviceId: { exact: cameraId } }
              : {}),
            height: { ideal: settings.height },
            frameRate: { ideal: settings.fps, max: settings.fps },
          },
          audio: false,
        })
      : null;
    if (camera) captureStreams.push(camera);
    const screen =
      mode === "camera"
        ? camera
        : mode === "audio"
          ? new MediaStream()
          : await navigator.mediaDevices.getDisplayMedia({
              video: {
                ...(settings.profile === "screen-text"
                  ? { resizeMode: "none" }
                  : { height: { max: settings.height } }),
                frameRate: { ideal: settings.fps, max: settings.fps },
              },
              audio: system,
            });
    captureStreams.push(screen);
    const audio = [];
    if (system && screen.getAudioTracks().length) audio.push(screen);
    else if (system) toast("La sorgente non fornisce audio di sistema.");
    if ($("microphone").checked || settings.audioOnly) {
      const id = $("microphoneDevice").value,
        processing = $("audioProcessing").checked,
        mic = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            ...(id !== "default" ? { deviceId: { exact: id } } : {}),
            echoCancellation: processing,
            noiseSuppression: processing,
            autoGainControl: $("autoGain").checked,
          },
        });
      captureStreams.push(mic);
      audioContext ||= new AudioContext();
      micGainNode = audioContext.createGain();
      micGainNode.gain.value = 10 ** (Number($("micGain").value) / 20);
      audioContext.createMediaStreamSource(mic).connect(micGainNode);
      const splitter = audioContext.createChannelSplitter(2);
      micGainNode.connect(splitter);
      micAnalysers = [0, 1].map((channel) => {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        splitter.connect(analyser, channel);
        return analyser;
      });
      micAnalyser = micAnalysers[0];
    }
    let videoTracks = screen.getVideoTracks();
    let outputSize = { width: 1920, height: settings.height };
    if (videoTracks.length) {
      const native = videoTracks[0].getSettings();
      videoTracks[0].contentHint =
        settings.profile === "screen-text" ? "detail" : "motion";
      outputSize = RecordingPolicy.size(
        native.width,
        native.height,
        settings.height,
      );
      settings.captureInfo = {
        sourceWidth: native.width,
        sourceHeight: native.height,
        sourceFps: native.frameRate,
        outputWidth: outputSize.width,
        outputHeight: outputSize.height,
        profile: settings.profile,
      };
      if (
        mode === "screen-camera" ||
        outputSize.width !== native.width ||
        outputSize.height !== native.height
      ) {
        const scaled =
          mode !== "screen-camera"
            ? await createScaledCapture(
                videoTracks[0],
                outputSize,
                settings.fps,
              )
            : null;
        if (scaled) {
          videoTracks = [scaled.track];
          stopVideoComposer = scaled.close;
          flushVideoFrame = scaled.flush;
          settings.captureInfo.scaling = "worker";
        } else {
          settings.captureInfo.scaling = "canvas";
          const sourceVideo = document.createElement("video");
          sourceVideo.srcObject = screen;
          sourceVideo.muted = true;
          const cameraVideo =
            mode === "screen-camera" ? document.createElement("video") : null;
          if (cameraVideo) {
            cameraVideo.srcObject = camera;
            cameraVideo.muted = true;
          }
          await Promise.all([
            sourceVideo.play(),
            ...(cameraVideo ? [cameraVideo.play()] : []),
          ]);
          const cv = document.createElement("canvas");
          cv.width = outputSize.width;
          cv.height = outputSize.height;
          const ctx = cv.getContext("2d", { alpha: false });
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          const composite = cv.captureStream(settings.fps),
            track = composite.getVideoTracks()[0];
          let callback = null,
            timer = null,
            last = -Infinity,
            stopped = false;
          const paint = (now, final = false) => {
            if (stopped) return;
            if (sourceVideo.readyState >= 2) {
              ctx.drawImage(sourceVideo, 0, 0, cv.width, cv.height);
              if (cameraVideo) {
                const w = cv.width / 4,
                  h = (w * cameraVideo.videoHeight) / cameraVideo.videoWidth;
                ctx.drawImage(
                  cameraVideo,
                  cv.width - w - 20,
                  cv.height - h - 20,
                  w,
                  h,
                );
              }
              track.requestFrame();
              last = now;
            }
            if (final) return;
            if (sourceVideo.requestVideoFrameCallback)
              callback = sourceVideo.requestVideoFrameCallback((now) =>
                paint(now),
              );
            else
              timer = setTimeout(
                () => paint(performance.now()),
                1000 / settings.fps,
              );
          };
          paint(performance.now());
          flushVideoFrame = () => paint(performance.now(), true);
          stopVideoComposer = () => {
            stopped = true;
            if (callback !== null)
              sourceVideo.cancelVideoFrameCallback?.(callback);
            clearTimeout(timer);
            sourceVideo.pause();
            sourceVideo.srcObject = null;
            if (cameraVideo) {
              cameraVideo.pause();
              cameraVideo.srcObject = null;
            }
          };
          captureStreams.push(composite);
          videoTracks = composite.getVideoTracks();
        }
      }
    }
    if (videoTracks[0])
      videoTracks[0].contentHint =
        settings.profile === "screen-text" ? "detail" : "motion";
    const mixed = new MediaStream(videoTracks);
    if (audio.length || micGainNode) {
      audioContext ||= new AudioContext();
      const dest = audioContext.createMediaStreamDestination();
      for (const s of audio)
        audioContext.createMediaStreamSource(s).connect(dest);
      micGainNode?.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
      await audioContext.resume();
    }
    const candidates = RecordingPolicy.mimeCandidates(settings).filter((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    const bitrate = RecordingPolicy.bitrate(
      settings,
      outputSize.width,
      outputSize.height,
    );
    let chosenRecorder;
    for (const mime of candidates)
      try {
        chosenRecorder = new MediaRecorder(mixed, {
          mimeType: mime,
          videoBitsPerSecond: bitrate,
          audioBitsPerSecond: settings.audioBitrate * 1000,
          videoKeyFrameIntervalDuration: 2000,
        });
        settings.mime = mime;
        break;
      } catch {}
    if (!chosenRecorder) throw Error("Codec di registrazione non disponibile");
    settings.captureInfo = {
      ...settings.captureInfo,
      requestedBitrate: bitrate,
      actualBitrate: chosenRecorder.videoBitsPerSecond,
      mime: chosenRecorder.mimeType,
      micGainDb: Number($("micGain").value),
      agc: $("autoGain").checked,
    };
    $("captureDiagnostics").textContent = settings.audioOnly
      ? "Solo audio"
      : `Sorgente ${settings.captureInfo.sourceWidth}×${settings.captureInfo.sourceHeight} → file ${outputSize.width}×${outputSize.height} · ${(chosenRecorder.videoBitsPerSecond / 1e6).toFixed(1)} Mbps richiesti · ${settings.profile === "screen-text" ? "Schermo e testo" : "Video e movimento"}`;
    await studio.beginRecording(settings);
    let writes = Promise.resolve(),
      writeError;
    recorder = chosenRecorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size)
        writes = writes
          .then(async () => studio.appendRecording(await e.data.arrayBuffer()))
          .catch((error) => {
            writeError = error;
            if (recorder && recorder.state !== "inactive") recorder.stop();
          });
    };
    recorder.onstop = async () => {
      finishing = true;
      const capturedDuration = elapsedRecording();
      stopCapture();
      try {
        if (discardCurrent) {
          // Cancel the capture writer first: a pending conversion write may be
          // waiting for more input and must not delay an explicit discard.
          await studio.abortRecording();
          await writes;
          toast("Registrazione scartata");
          return;
        }
        await writes;
        if (writeError) throw writeError;
        toast(
          "Finalizzazione " +
            settings.format.toUpperCase() +
            ": assemblaggio del file…",
        );
        const m = await studio.finishRecording(capturedDuration);
        if (m) {
          if (m.recordingInfo && m.kind !== "audio") {
            const rate = String(m.fps || "0")
                .split("/")
                .map(Number),
              actualFps = rate.length > 1 ? rate[0] / rate[1] : rate[0];
            $("captureDiagnostics").textContent =
              `File pronto: ${m.width}×${m.height} · ${m.codec} ${m.codecProfile || ""} · ${actualFps.toFixed(1)} FPS medi · ${((m.fileBitrate || 0) / 1e6).toFixed(2)} Mbps effettivi. Sorgente acquisita: ${settings.captureInfo.sourceWidth}×${settings.captureInfo.sourceHeight}.`;
          }
          checkpoint();
          project.media.push(m);
          renderLibrary();
          requestWave(m);
          if (overdub) {
            const region = overdub;
            overdub = null;
            if (region.mute)
              project = Timeline.muteRange(
                project,
                region.ids,
                region.start,
                region.end,
                uid,
              );
            const track = Timeline.addTrack(project),
              id = uid();
            project.clips.push({
              id,
              sourceInstanceId: id,
              mediaId: m.id,
              start: region.start,
              track,
              in: 0,
              out: m.duration,
              speed: 1,
              volume: 1,
              mono: true,
            });
            selection = new Set([id]);
            changed();
          }
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
        discardCurrent = false;
        await recorderReady();
      }
    };
    recorder.onerror = (e) => {
      toast(e.error?.message || "Errore di registrazione");
      if (recorder?.state !== "inactive") recorder.stop();
    };
    for (const t of screen.getVideoTracks()) t.onended = stopRecording;
    recorder.start(1000);
    startTime = performance.now();
    pausedAt = 0;
    pausedMs = 0;
    $("recordDialog").close();
    $("recordingBar").hidden = false;
    $("recordingTime").textContent =
      "● " + settings.format.toUpperCase() + " · " + settings.fps + " FPS";
    const meter = new MicMeter.Envelope(),
      samples = micAnalysers.length
        ? micAnalysers.map((a) => new Float32Array(a.fftSize))
        : [new Float32Array(2048)];
    let lastToolbar = 0,
      toolbarBusy = false;
    recordTimer = setInterval(() => {
      const paused = recorder?.state === "paused";
      samples.forEach((buffer, i) => {
        buffer.fill(0);
        if (!paused) micAnalysers[i]?.getFloatTimeDomainData(buffer);
      });
      const now = performance.now(),
        state = { ...meter.sample(samples, now), micActive: !!micAnalyser },
        label = fmt(elapsedRecording());
      $("recordingTime").textContent = (paused ? "Ⅱ PAUSA · " : "● ") + label;
      $("recordingBar").classList.toggle("paused", paused);
      $("pauseRecording").textContent = paused ? "Riprendi" : "Pausa";
      MicMeter.paint(
        $("recordLevel"),
        $("recordPeak"),
        $("recordDb"),
        $("recordMicStatus"),
        state,
        paused,
      );
      if (!toolbarBusy && now - lastToolbar >= 32) {
        lastToolbar = now;
        toolbarBusy = true;
        studio
          .recordingToolbar({
            active: true,
            finishing: false,
            countdown: 0,
            name: $("recordName").value,
            paused,
            time: label,
            ...state,
          })
          .catch((e) => toast(e.message))
          .finally(() => (toolbarBusy = false));
      }
    }, 1000 / 30);
  } catch (e) {
    stopCapture();
    await studio.abortRecording();
    throw e;
  } finally {
    $("startRecording").disabled = false;
  }
});
$("stopRecording").onclick = stopRecording;
window.onbeforeunload = (e) => {
  if (recorder || finishing || exportBusy) {
    e.preventDefault();
    e.returnValue = "Operazione in corso";
  }
};
window.onresize = () => {
  applyPanels();
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

// Independent compositing effects have their own timeline interval and no source media.
function addEffect(type, placement) {
  pause();
  if (!placement) checkpoint();
  const m = {
    id: uid(),
    kind: "effect",
    name: type === "blur" ? "Sfocatura" : "Pixelizzazione",
    duration: 5,
    hasAudio: false,
  };
  const c = {
    id: uid(),
    mediaId: m.id,
    track: placement?.track ?? Number($("activeTrack").value),
    start: placement?.start ?? time,
    in: 0,
    out: 5,
    speed: 1,
    volume: 0,
    effect: { type, strength: 20, x: 30, y: 30, width: 40, height: 40 },
  };
  if (!Timeline.canPlace(project.clips, [c])) {
    toast("Intervallo occupato: scegli uno spazio libero o un’altra traccia.");
    return;
  }
  if (!project.media.some((existing) => existing.id === m.id))
    project.media.push(m);
  project.clips.push(c);
  selection = new Set([c.id]);
  render();
}
$("addBlur").onclick = () => addEffect("blur");
$("addPixel").onclick = () => addEffect("pixel");
$("muteClip").onchange = () =>
  edit((c) => {
    c.muted = $("muteClip").checked;
  });
$("monoClip").onchange = () =>
  edit((c) => {
    c.mono = $("monoClip").checked;
  });
for (const id of ["voiceNoise", "voiceLevel"])
  $(id).onchange = () =>
    edit((c) => {
      c.voice = {
        ...c.voice,
        bypass: false,
        noise: Number($("voiceNoise").value) / 100,
        level: Number($("voiceLevel").value) / 100,
      };
    });
const changeNoise = $("voiceNoise").onchange;
$("voiceNoise").onchange = (event) => {
  pause();
  changeNoise(event);
  prepareNoisePreviews(selected());
};
$("textWidth").onchange = () =>
  edit((c) => {
    if (c.annotation) c.annotation.width = Number($("textWidth").value);
  });
$("visualZoom").oninput = () => {
  const c = first();
  if (!c || !["video", "image"].includes(mediaOf(c).kind)) return;
  if (!$("visualZoom").dataset.editing) {
    checkpoint();
    $("visualZoom").dataset.editing = "1";
  }
  c.zoom = {
    ...(c.zoom || { x: 0.5, y: 0.5 }),
    from: Number($("visualZoom").value),
    to: Number($("visualZoom").value),
  };
  draw();
};
$("visualZoom").onchange = () => {
  delete $("visualZoom").dataset.editing;
  changed();
};
$("resetFrame").onclick = () =>
  edit((c) => {
    delete c.zoom;
    delete c.layout;
  });
function updatePreviewView(center = false) {
  const cv = $("previewCanvas"),
    stage = document.querySelector(".stage"),
    surface = $("previewSurface"),
    size = Timeline.projectSize(project);
  const mode = $("previewScale").value;
  const quality = Number($("previewQuality").value) || 1280;
  const selectedWidth =
      quality === 1280
        ? Math.min(
            size.width,
            mode === "fit"
              ? 1280
              : Math.max(1280, (size.width * Number(mode)) / 100),
          )
        : quality,
    w = scrubbingPreview ? Math.min(640, selectedWidth) : selectedWidth,
    h = Math.max(1, Math.round((w * size.height) / size.width));
  if (cv.width !== w || cv.height !== h) {
    // Resizing a canvas erases it: preserve its last frame across quality changes.
    const previous = document.createElement("canvas");
    previous.width = cv.width;
    previous.height = cv.height;
    previous.getContext("2d").drawImage(cv, 0, 0);
    cv.width = w;
    cv.height = h;
    cv.getContext("2d").drawImage(previous, 0, 0, w, h);
  }
  $("projectDimensions").textContent =
    `PROGETTO · ${size.width} × ${size.height}`;
  $("originalResolution").textContent =
    `Originale · ${size.width} × ${size.height}`;
  const dpr = window.devicePixelRatio || 1;
  const factor =
    mode === "fit"
      ? Math.min(
          stage.clientWidth / size.width,
          stage.clientHeight / size.height,
        )
      : Number(mode) / 100 / dpr;
  const width = size.width * factor,
    height = size.height * factor;
  surface.style.width = Math.max(stage.clientWidth, width) + "px";
  surface.style.height = Math.max(stage.clientHeight, height) + "px";
  Object.assign(cv.style, {
    width: width + "px",
    height: height + "px",
    left: Math.max(0, (stage.clientWidth - width) / 2) + "px",
    top: Math.max(0, (stage.clientHeight - height) / 2) + "px",
  });
  if (center) {
    stage.scrollLeft = Math.max(0, (width - stage.clientWidth) / 2);
    stage.scrollTop = Math.max(0, (height - stage.clientHeight) / 2);
  }
}
$("previewQuality").onchange = () => {
  updatePreviewView();
  draw();
  localStorage.setItem("crea-preview", $("previewQuality").value);
};
$("previewQuality").value = localStorage.getItem("crea-preview") || "1280";
$("previewScale").value = localStorage.getItem("crea-preview-scale") || "fit";
$("previewScale").onchange = () => {
  updatePreviewView(true);
  draw();
  localStorage.setItem("crea-preview-scale", $("previewScale").value);
};
new ResizeObserver(() => {
  updatePreviewView();
  draw();
}).observe(document.querySelector(".stage"));
$("openExportVideo").onclick = safe(() => studio.openExport("video"));
$("openExportFolder").onclick = safe(() => studio.openExport("folder"));
for (const id of exportPreferenceFields) {
  if (id === "exportEncoder" || savedExportPreferences[id] === undefined)
    continue;
  const field = $(id);
  if (field.type === "checkbox") field.checked = !!savedExportPreferences[id];
  else field.value = savedExportPreferences[id];
}
for (const id of exportPreferenceFields)
  $(id).addEventListener("change", () => {
    updateExportControls();
    saveExportPreferences();
  });
for (const prefix of ["export", "record"]) {
  const preset = $(prefix + "Preset"),
    slider = $(prefix + "Quality");
  preset.onchange = (event) => {
    if (preset.value !== "custom") {
      slider.value = preset.value;
      slider.dispatchEvent(new Event("input"));
    }
    if (prefix === "export") {
      updateExportControls();
      if (event) saveExportPreferences();
    }
  };
  slider.addEventListener("input", () => {
    if (preset.value !== slider.value) preset.value = "custom";
    if (prefix === "export") updateExportControls();
  });
  preset.onchange();
}
studio
  .encoders()
  .then((encoders) => {
    for (const e of encoders) {
      const option = new Option(e.label, e.id);
      $("exportEncoder").add(option);
    }
    const wanted = savedExportPreferences.exportEncoder;
    if ([...$("exportEncoder").options].some((o) => o.value === wanted))
      $("exportEncoder").value = wanted;
    $("gpuStatus").textContent = encoders.length
      ? "GPU disponibile · verifica encoder eseguita"
      : "GPU non disponibile: verrà utilizzata la CPU";
    $("exportDiagnostics").textContent = encoders.length
      ? "Encoder disponibili: " +
        encoders.map((e) => e.label).join(", ") +
        ". Eventuali ripieghi CPU sono riportati durante l’esportazione."
      : "Nessun encoder hardware ha superato la codifica di prova.";
    updateExportControls();
  })
  .catch(() => {
    $("gpuStatus").textContent = "GPU non disponibile: verrà utilizzata la CPU";
    $("exportDiagnostics").textContent =
      "Verifica degli encoder GPU non riuscita.";
    updateExportControls();
  });
function ensureTrackRows() {
  const count = Timeline.trackCount(project);
  if ($("labelRows").querySelectorAll("[data-choose-track]").length !== count) {
    document.querySelectorAll(".track").forEach((n) => n.remove());
    $("labelRows").replaceChildren();
    const active = Number($("activeTrack").value) || 0;
    for (const id of ["activeTrack", "clipTrack"]) {
      $(id).replaceChildren();
      for (let t = 0; t < count; t++)
        $(id).add(new Option("Traccia " + (t + 1), t));
    }
    $("activeTrack").value = Math.min(active, count - 1);
    for (let t = count - 1; t >= 0; t--) {
      const row = el("div", "track");
      row.id = "track" + t;
      row.dataset.track = t;
      $("timeline").insertBefore(row, $("playhead"));
      const label = el("div");
      label.dataset.chooseTrack = t;
      label.append(
        el("span", "", String(t + 1)),
        el("b", "", "Traccia " + (t + 1)),
        el("small", "", "Video · immagini · audio · testi · effetti"),
      );
      label.onclick = () => ($("activeTrack").value = t);
      label.oncontextmenu = (e) => showTrackContext(e, t);
      const mute = el("button", "track-mute", "♪");
      mute.title = "Silenzia traccia";
      mute.setAttribute("aria-label", "Silenzia traccia " + (t + 1));
      mute.onclick = (e) => {
        e.stopPropagation();
        pause();
        checkpoint();
        project.trackMuted[t] = !project.trackMuted[t];
        changed();
      };
      label.append(mute);
      const handle = el("div", "track-resizer");
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-label", "Altezza traccia " + (t + 1));
      label.append(handle);
      handle.onpointerdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        checkpoint();
        const y = e.clientY,
          height = label.getBoundingClientRect().height;
        const move = (ev) => {
          project.trackHeights[t] = Math.max(
            Timeline.MIN_TRACK_HEIGHT,
            Math.min(600, height + y - ev.clientY),
          );
          scheduleTrackGeometry();
        };
        captureMove(e, move, (ev) => {
          if (ev.type !== "pointercancel") move(ev);
          applyTrackGeometry();
        });
      };
      $("labelRows").append(label);
      bindTrack(t);
    }
  }
  $("addTrack").disabled = count >= Timeline.MAX_TRACKS;
}
$("addTrack").onclick = () => {
  pause();
  checkpoint();
  try {
    const t = Timeline.addTrack(project);
    renderTimeline();
    $("activeTrack").value = t;
    $("timelineScroll").scrollTop = 0;
  } catch (e) {
    toast(e.message);
  }
};
$("newTrackDrop").ondragover = (e) => {
  e.preventDefault();
  $("newTrackDrop").classList.add("dragover");
};
$("newTrackDrop").ondragleave = () =>
  $("newTrackDrop").classList.remove("dragover");
$("newTrackDrop").ondrop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  $("newTrackDrop").classList.remove("dragover");
  const element = e.dataTransfer.getData("application/akhbar-element");
  if (element) {
    safe(() =>
      insertElement(
        element,
        Math.max(
          0,
          (e.clientX - $("ruler").getBoundingClientRect().left) / scale,
        ),
        Timeline.trackCount(project),
      ),
    )();
    return;
  }
  const id = e.dataTransfer.getData("application/crea-media");
  if (!id) return;
  if (Timeline.trackCount(project) >= Timeline.MAX_TRACKS)
    return toast("Limite tracce raggiunto.");
  checkpoint();
  const track = Timeline.addTrack(project);
  renderTimeline();
  addMedia(
    id,
    Math.max(0, (e.clientX - $("ruler").getBoundingClientRect().left) / scale),
    track,
  );
};
// Persist workspace layout independently of project content.
let panelLayout = { library: 265, properties: 235, timeline: 220 };
try {
  panelLayout = {
    ...panelLayout,
    ...JSON.parse(localStorage.getItem("crea-panels") || "{}"),
  };
} catch {}
// Migrate the old tall default once; subsequent adjustments stay as chosen.
if (!localStorage.getItem("akhbar-compact-timeline")) {
  panelLayout.timeline = Math.min(panelLayout.timeline, 220);
  localStorage.setItem("akhbar-compact-timeline", "true");
  localStorage.setItem("crea-panels", JSON.stringify(panelLayout));
}
let expandedTimelineHeight = 320;
$("compactTimeline").onclick = () => {
  if (panelLayout.timeline > 180) {
    expandedTimelineHeight = panelLayout.timeline;
    panelLayout.timeline = 180;
  } else panelLayout.timeline = expandedTimelineHeight;
  applyPanels();
  localStorage.setItem("crea-panels", JSON.stringify(panelLayout));
};
function applyPanels() {
  const root = document.documentElement;
  panelLayout.library = Math.max(265, panelLayout.library);
  root.style.setProperty("--library-width", panelLayout.library + "px");
  root.style.setProperty("--properties-width", panelLayout.properties + "px");
  panelLayout.timeline = Math.max(
    180,
    Math.min(panelLayout.timeline, Math.max(180, innerHeight - 350)),
  );
  root.style.setProperty("--timeline-height", panelLayout.timeline + "px");
  $("compactTimeline").setAttribute(
    "aria-pressed",
    String(panelLayout.timeline <= 180),
  );
  $("compactTimeline").textContent =
    panelLayout.timeline <= 180 ? "↕ Espandi" : "↕ Compatta";
}
function panelHandle(parent, cls, key, sign, min, max) {
  const h = el("div", "panel-resizer " + cls);
  h.setAttribute("role", "separator");
  h.setAttribute("aria-label", "Ridimensiona " + key);
  parent.append(h);
  h.onpointerdown = (e) => {
    e.preventDefault();
    const start = key === "timeline" ? e.clientY : e.clientX,
      old = panelLayout[key];
    captureMove(
      e,
      (ev) => {
        panelLayout[key] = Math.max(
          min,
          Math.min(
            max,
            old +
              sign * ((key === "timeline" ? ev.clientY : ev.clientX) - start),
          ),
        );
        applyPanels();
      },
      () => localStorage.setItem("crea-panels", JSON.stringify(panelLayout)),
    );
  };
}
applyPanels();
panelHandle(
  document.querySelector(".library"),
  "right",
  "library",
  1,
  265,
  500,
);
panelHandle(
  document.querySelector(".properties"),
  "left",
  "properties",
  -1,
  200,
  450,
);
panelHandle(
  document.querySelector(".timeline-panel"),
  "top",
  "timeline",
  -1,
  180,
  Math.max(220, innerHeight - 350),
);
$("resetPanels").onclick = () => {
  panelLayout = { library: 265, properties: 235, timeline: 220 };
  applyPanels();
  localStorage.removeItem("crea-panels");
};
// Atomic recovery snapshot every minute, including edits since the last manual save.
setInterval(() => {
  if (project.clips.length)
    studio
      .autosave(project)
      .catch((e) => toast("Salvataggio automatico non riuscito: " + e.message));
}, 60000);
function applyOpened(data, recovered = false) {
  if (!data) return;
  pause();
  project = Timeline.validate(data);
  waveEpoch++;
  waves.clear();
  waveQueue = Promise.resolve();
  selection.clear();
  time = 0;
  history = [];
  future = [];
  resetPlayers();
  const preparation = beginPreviewPreparation();
  render();
  preparation.track("initial-video", readyVideos());
  for (const m of project.media) requestWave(m);
  cleanProjectJSON = recovered ? "" : JSON.stringify(project);
  exportOutputPath = null;
  updateProjectTitle();
}
studio.onProjectFile(() =>
  safe(() =>
    transitionProject(async () => {
      const data = await studio.projectFile();
      if (data) applyOpened(data);
    }),
  )(),
);
safe(async () => {
  const file = await studio.projectFile();
  if (file) applyOpened(file);
  else {
    const recovery = await studio.recover();
    if (recovery) applyOpened(recovery, true);
    else cleanProjectJSON = JSON.stringify(project);
  }
})();
setInterval(() => {
  let peak = 0;
  const a = transport.analyser;
  if (a) {
    const samples = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(samples);
    for (const v of samples) peak = Math.max(peak, Math.abs(v));
  }
  $("audioMeter").textContent =
    peak >= 0.98
      ? "⚠ Audio troppo forte"
      : peak > 0
        ? "Audio " + Math.round(20 * Math.log10(peak)) + " dB"
        : "Audio: —";
  $("audioMeter").style.color = peak >= 0.98 ? "#ff716d" : "";
}, 100);

$("playhead").onpointerdown = (e) => {
  e.stopPropagation();
  $("ruler").onpointerdown(e);
};

$("previewCanvas").onpointermove = (e) => {
  if (panView) {
    $("previewCanvas").style.cursor = "grab";
    return;
  }
  const c = first(),
    r = previewRect(),
    handle =
      c &&
      hitHandle(
        previewBox(c),
        ((e.clientX - r.left) / r.width) * 100,
        ((e.clientY - r.top) / r.height) * 100,
      );
  const cursors = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
  };
  $("previewCanvas").style.cursor = cursors[handle] || "move";
};

transport.onbuffering = (at) => {
  pause();
  time = at;
  syncPlayers(true);
  updateHead();
  toast("Audio pronto: riprendo dal segmento senza saltarne l’inizio.");
  play();
};
transport.onerror = (e) => {
  pause();
  toast("Audio non disponibile: " + e.message);
};

// Independent source monitor: never inserts into the edit or changes the playhead.
function showSource(m) {
  pause();
  $("sourceName").textContent = m.name;
  const player = document.createElement(
    m.kind === "image" ? "img" : m.kind === "audio" ? "audio" : "video",
  );
  player.src = m.url;
  player.addEventListener("loadedmetadata", fitSourcePreview);
  player.addEventListener("load", fitSourcePreview);
  if (m.kind !== "image") player.controls = true;
  $("sourcePlayer").replaceChildren(player);
  $("sourceDialog").showModal();
  fitSourcePreview();
}
function fitSourcePreview() {
  const box = $("sourcePlayer"),
    player = box.querySelector("video,img");
  if (!player) return;
  const width = player.videoWidth || player.naturalWidth;
  const height = player.videoHeight || player.naturalHeight;
  if (!width || !height) return;
  const ratio = Math.min(
    0.3,
    box.clientWidth / width,
    box.clientHeight / height,
  );
  player.style.width = width * ratio + "px";
  player.style.height = height * ratio + "px";
}
new ResizeObserver(fitSourcePreview).observe($("sourcePlayer"));
$("sourceDialog").onclose = () => {
  if ($("sourceDialog").open) return;
  $("sourcePlayer")
    .querySelectorAll("video,audio")
    .forEach((p) => p.pause());
  $("sourcePlayer").replaceChildren();
};
for (const [id, view] of [
  ["mediaGrid", "grid"],
  ["mediaListView", "list"],
]) {
  $(id).onclick = () => {
    mediaView = view;
    localStorage.setItem("akhbar-media-view", view);
    renderLibrary();
  };
}
function libraryPanel(elements) {
  $("mediaPanel").hidden = elements;
  $("elementsPanel").hidden = !elements;
  $("railMedia").classList.toggle("active", !elements);
  $("railElements").classList.toggle("active", elements);
}
$("railMedia").onclick = () => libraryPanel(false);
$("railElements").onclick = () => libraryPanel(true);
$("projectSeek").oninput = () => {
  if (playing || preparing) pause();
  seek(Number($("projectSeek").value), true);
};
$("projectSeek").onchange = finishPreviewScrubbing;
$("projectSeek").onpointerup = finishPreviewScrubbing;
$("projectSeek").onpointercancel = finishPreviewScrubbing;
$("fitTimeline").onclick = () => {
  fitTimeline = true;
  scale = fitScale();
  $("timelineScroll").scrollLeft = 0;
  renderTimeline();
};
new ResizeObserver(() => {
  if (fitTimeline) renderTimeline();
  else requestRulerPaint();
}).observe($("timelineScroll"));
function showRipple() {
  $("rippleFamily").setAttribute("aria-pressed", String(rippleFamily));
  $("rippleFamily").setAttribute(
    "aria-label",
    "Chiudi spazi della clip: " + (rippleFamily ? "sì" : "no"),
  );
  $("rippleFamily").title =
    "Chiudi spazi della clip: " +
    (rippleFamily ? "sì" : "no") +
    ". Solo fra segmenti della stessa clip; aggancio durante gli spostamenti sempre attivo.";
}
$("rippleFamily").onclick = () => {
  rippleFamily = !rippleFamily;
  localStorage.setItem("akhbar-family-ripple", String(rippleFamily));
  showRipple();
};
showRipple();
$("markRangeStart").onclick = () => {
  $("rangeStart").value = time.toFixed(3);
  drawRecordRange();
};
$("markRangeEnd").onclick = () => {
  $("rangeEnd").value = time.toFixed(3);
  drawRecordRange();
};
$("recordPhrase").onclick = safe(async () => {
  const start = Number($("rangeStart").value),
    end = Number($("rangeEnd").value);
  if (!(end > start) || start < 0)
    throw Error("Seleziona un intervallo valido");
  if (Timeline.trackCount(project) >= Timeline.MAX_TRACKS)
    throw Error("Nessuna traccia disponibile");
  const ids = selected()
    .filter((c) => mediaOf(c).hasAudio)
    .map((c) => c.id);
  if ($("replaceAudio").checked && !ids.length)
    throw Error("Seleziona le clip audio da silenziare nel tratto sostituito");
  pause();
  overdub = { start, end, ids, mute: $("replaceAudio").checked };
  await showRecording();
  $("microphone").checked = true;
});
$("recordDialog").addEventListener("close", () => {
  if (!recorder) overdub = null;
});
$("freezeFrame").onclick = safe(async () => {
  pause();
  const selectedClip = first(),
    atTime = time,
    activeProject = project;
  const c = selectedClip && clone(selectedClip);
  if (
    !c ||
    mediaOf(c).kind !== "video" ||
    time < c.start ||
    time >= c.start + Timeline.duration(c)
  )
    throw Error("Seleziona un video e posiziona il cursore al suo interno");
  if (Timeline.trackCount(project) >= Timeline.MAX_TRACKS)
    throw Error("Nessuna traccia disponibile");
  const m = await studio.freezeFrame(
    mediaOf(c),
    Timeline.sourceTime(c, atTime),
  );
  if (project !== activeProject)
    throw Error("Il progetto è cambiato durante l’estrazione del fotogramma");
  checkpoint();
  project.media.push(m);
  const track = Timeline.addTrack(project),
    id = uid();
  const still = {
    id,
    sourceInstanceId: id,
    mediaId: m.id,
    start: atTime,
    track,
    in: 0,
    out: workspacePrefs.freezeDuration,
    speed: 1,
    volume: 0,
  };
  if (c.layout) still.layout = clone(c.layout);
  if (c.effect) still.effect = clone(c.effect);
  if (c.zoom) {
    const z = c.zoom,
      at = (atTime - c.start) / Timeline.duration(c),
      value = z.from + (z.to - z.from) * at;
    still.zoom = { ...z, from: value, to: value };
  }
  project.clips.push(still);
  selection = new Set([id]);
  render();
  toast(
    "Fermo immagine inserito su una nuova traccia; durata regolabile trascinando i bordi.",
  );
});
let exportOutputPath = null;
$("chooseExportPath").onclick = safe(async () => {
  const path = await studio.chooseExport({
    directory: $("exportDirectory").value,
    name: $("exportFilename").value,
  });
  if (path) {
    exportOutputPath = path;
    const split = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    $("exportDirectory").value =
      path.slice(0, split === 2 && path[1] === ":" ? 3 : split) || "/";
    $("exportFilename").value = path.slice(split + 1);
    workspacePrefs = await studio.setPreferences({
      exports: $("exportDirectory").value,
    });
    $("exportsDirectory").value = workspacePrefs.exports;
    saveExportPreferences();
    showExportTarget();
  }
});
for (const id of ["exportFilename", "exportDirectory"])
  $(id).addEventListener("input", () => {
    exportOutputPath = null;
    showExportTarget();
  });
$("exportDirectory").onchange = safe(async () => {
  workspacePrefs = await studio.setPreferences({
    exports: $("exportDirectory").value,
  });
  $("exportsDirectory").value = workspacePrefs.exports;
});
function applyPreferences(p) {
  workspacePrefs = { ...workspacePrefs, ...p };
  if (!exportBusy) {
    $("exportDirectory").value = workspacePrefs.exports || "";
    exportOutputPath = null;
    showExportTarget();
  }
  document.documentElement.style.setProperty(
    "--ruler-color",
    workspacePrefs.rulerColor,
  );
  for (const key of ["projects", "recordings", "exports"])
    $(key + "Directory").value = p[key] || "";
  $("imageDuration").value = String(workspacePrefs.imageDuration).replace(
    ".",
    ",",
  );
  $("freezeDuration").value = String(workspacePrefs.freezeDuration).replace(
    ".",
    ",",
  );
  $("rulerColor").value = workspacePrefs.rulerColor;
}
const preferencesReady = studio.preferences().then(applyPreferences);
$("settingsBtn").onclick = safe(async () => {
  await preferencesReady;
  applyPreferences(await studio.preferences());
  $("settingsStatus").textContent = "";
  $("settingsDialog").showModal();
});
for (const key of ["projects", "recordings", "exports"])
  $("choose" + key[0].toUpperCase() + key.slice(1) + "Directory").onclick =
    safe(async () => {
      const dir = await studio.chooseDirectory();
      if (dir) {
        workspacePrefs = await studio.setPreferences({ [key]: dir });
        $(key + "Directory").value = dir;
        $("settingsStatus").textContent = "Cartella memorizzata.";
      }
    });
$("saveSettings").onclick = safe(async () => {
  const p = await studio.setPreferences({
    imageDuration: $("imageDuration").value,
    freezeDuration: $("freezeDuration").value,
    rulerColor: $("rulerColor").value,
  });
  applyPreferences(p);
  $("settingsStatus").textContent = "Impostazioni salvate.";
});
$("noiseCompare").onclick = () => {
  const c = first();
  if (!c) return;
  const resume = playing;
  edit((c) => {
    c.voice = { noise: 0, level: 0, ...c.voice, bypass: !c.voice?.bypass };
  });
  $("noiseCompare").setAttribute(
    "aria-pressed",
    String(!!first()?.voice?.bypass),
  );
  $("noiseCompare").textContent = first()?.voice?.bypass
    ? "Originale attivo · ascolta elaborato"
    : "Ascolta originale (prima/dopo)";
  if (resume) safe(play)();
};

function drawRecordRange() {
  const from = Number($("rangeStart").value),
    to = Number($("rangeEnd").value),
    overlay = $("recordRangeOverlay");
  overlay.hidden = !(to > from);
  overlay.style.left = from * scale + "px";
  overlay.style.width = Math.max(0, (to - from) * scale) + "px";
}
$("rangeStart").oninput = $("rangeEnd").oninput = drawRecordRange;

$("noiseModerate").onclick = () =>
  edit((c) => {
    c.voice = {
      ...c.voice,
      noise: 0.25,
      level: c.voice?.level || 0,
      bypass: false,
    };
  });

// Project lifecycle. UI-only selections/zoom are not unsaved project changes.
function isProjectDirty() {
  return JSON.stringify(project) !== cleanProjectJSON;
}
async function updateProjectTitle() {
  const info = await studio.projectInfo();
  $("projectTitle").textContent = info.name || "Progetto senza nome";
  $("dirtyStatus").textContent = isProjectDirty()
    ? "Modifiche non salvate"
    : "Salvato";
}
function askProjectName(initial) {
  return new Promise((resolve) => {
    const dialog = $("projectNameDialog");
    dialog.returnValue = "";
    $("projectNameInput").value = initial || "Montaggio";
    dialog.addEventListener(
      "close",
      () =>
        resolve(
          dialog.returnValue === "save" ? $("projectNameInput").value : null,
        ),
      { once: true },
    );
    dialog.showModal();
    $("projectNameInput").select();
  });
}
let saveBusy = false;
async function saveCurrent(saveAs = false) {
  if (saveBusy) return false;
  saveBusy = true;
  try {
    const info = await studio.projectInfo();
    let options = { saveAs };
    if (saveAs || !info.path) {
      const name = await askProjectName(info.name);
      if (name === null) return false;
      options.name = name;
    }
    const snapshot = JSON.stringify(project),
      data = JSON.parse(snapshot);
    const saved = await studio.saveProject(data, options);
    if (saved) {
      cleanProjectJSON = snapshot;
      await updateProjectTitle();
      toast("Progetto salvato con i materiali.");
    }
    return saved;
  } finally {
    saveBusy = false;
  }
}
async function transitionProject(action) {
  if (transitionBusy) return;
  transitionBusy = true;
  try {
    if (recorder || finishing || exportBusy)
      throw Error(
        "Termina la registrazione o l’esportazione prima di cambiare progetto",
      );
    if (isProjectDirty()) {
      const choice = await studio.confirmUnsaved();
      if (choice === "cancel") return;
      if (choice === "save" && !(await saveCurrent())) return;
    }
    pause();
    await action();
  } finally {
    transitionBusy = false;
  }
}
async function emptyWorkspace() {
  await studio.resetProject();
  applyOpened(Timeline.empty());
  previewFocus = null;
  $("sourcePlayer").replaceChildren();
  $("exportPath").textContent = "Destinazione automatica dalle Impostazioni";
  toast("Progetto chiuso. Pronto per un nuovo progetto.");
}
$("fileNew").onclick = $("fileClose").onclick = safe(() =>
  transitionProject(emptyWorkspace),
);
$("fileOpen").onclick = () => $("openProject").click();
$("fileSave").onclick = safe(() => saveCurrent());
$("fileSaveAs").onclick = safe(() => saveCurrent(true));
$("fileExport").onclick = () => $("exportBtn").click();
$("fileMenu").addEventListener(
  "toggle",
  safe(async () => {
    if (!$("fileMenu").open) return;
    const files = await studio.recentProjects(),
      list = $("recentProjects");
    list.replaceChildren();
    if (!files.length) list.append(el("small", "", "Nessun progetto recente"));
    for (const file of files) {
      const button = el("button", "", file.split(/[\\/]/).pop());
      button.title = file;
      button.onclick = safe(() => {
        $("fileMenu").open = false;
        return transitionProject(async () => {
          const data = await studio.openProject(file);
          if (data) applyOpened(data);
        });
      });
      list.append(button);
    }
  }),
);
$("fileMenu")
  .querySelectorAll("button")
  .forEach((button) =>
    button.addEventListener("click", () => ($("fileMenu").open = false)),
  );
document.addEventListener("pointerdown", (e) => {
  if (!$("fileMenu").contains(e.target)) $("fileMenu").open = false;
});
studio.onCloseRequest(() =>
  safe(() => transitionProject(() => studio.quitApproved()))(),
);
setInterval(() => {
  $("dirtyStatus").textContent = isProjectDirty()
    ? "Modifiche non salvate"
    : "Salvato";
}, 700);

// Fixed column count with tiles that can shrink to the actual panel width.
for (const [id, delta] of [
  ["mediaColumnsMinus", -1],
  ["mediaColumnsPlus", 1],
]) {
  $(id).onclick = () => {
    mediaColumns = Math.max(1, mediaColumns + delta);
    localStorage.setItem("akhbar-media-columns", String(mediaColumns));
    renderLibrary();
  };
}

function insertElement(type, start, track) {
  if (!["text", "arrow", "circle", "blur", "pixel"].includes(type))
    throw Error("Elemento non disponibile");
  if (Timeline.trackCount(project) >= Timeline.MAX_TRACKS)
    throw Error("Limite tracce raggiunto");
  pause();
  checkpoint();
  Timeline.insertTrack(project, track);
  const placement = { start, track };
  if (["blur", "pixel"].includes(type)) addEffect(type, placement);
  else annotation(type, placement);
  $("activeTrack").value = track;
}
for (const [id, type] of [
  ["addText", "text"],
  ["addArrow", "arrow"],
  ["addCircle", "circle"],
  ["addBlur", "blur"],
  ["addPixel", "pixel"],
]) {
  const button = $(id);
  button.draggable = true;
  button.title = "Trascina nella timeline: nuova traccia sopra la destinazione";
  button.ondragstart = (e) => {
    draggedElement = type;
    e.dataTransfer.setData("application/akhbar-element", type);
    e.dataTransfer.effectAllowed = "copy";
  };
  button.ondragend = () => {
    draggedElement = null;
    document.querySelectorAll(".drop-ghost").forEach((n) => n.remove());
  };
}

// Position guides are editor overlays only and never enter exported rasters.
function showAlignGuides(lines, rect) {
  const layer = $("alignGuides"),
    stage = document.querySelector(".stage"),
    sr = stage.getBoundingClientRect();
  layer.replaceChildren();
  for (const line of lines) {
    const n = el("div", "align-guide " + line.axis);
    if (line.axis === "x")
      Object.assign(n.style, {
        left:
          rect.left -
          sr.left +
          stage.scrollLeft +
          (rect.width * line.at) / 100 +
          "px",
        top: rect.top - sr.top + stage.scrollTop + "px",
        height: rect.height + "px",
      });
    else
      Object.assign(n.style, {
        top:
          rect.top -
          sr.top +
          stage.scrollTop +
          (rect.height * line.at) / 100 +
          "px",
        left: rect.left - sr.left + stage.scrollLeft + "px",
        width: rect.width + "px",
      });
    layer.append(n);
  }
}
function snapPreviewBox(box, rect) {
  const lines = [];
  for (const [axis, size, pixels] of [
    ["x", "width", rect.width],
    ["y", "height", rect.height],
  ]) {
    const targets = [0, 50, 100];
    for (const c of Timeline.active(project.clips, previewTime()))
      if (!selection.has(c.id)) {
        const other = previewBox(c);
        if (other)
          targets.push(
            other[axis],
            other[axis] + other[size] / 2,
            other[axis] + other[size],
          );
      }
    let best = null;
    for (const at of targets)
      for (const delta of [0, box[size] / 2, box[size]]) {
        const diff = at - (box[axis] + delta);
        if (
          Math.abs(diff) <= 600 / Math.max(1, pixels) &&
          (!best || Math.abs(diff) < Math.abs(best.diff))
        )
          best = { diff, at };
      }
    if (best) {
      box[axis] += best.diff;
      lines.push({ axis, at: best.at });
    }
  }
  showAlignGuides(lines, rect);
  return box;
}
function centerSelection(axis) {
  edit((c) => {
    const b = previewBox(c);
    if (!b) return;
    const shift = 50 - b[axis] - b[axis === "x" ? "width" : "height"] / 2;
    if (mediaOf(c).kind === "effect")
      c.effect = { ...c.effect, [axis]: Math.max(0, c.effect[axis] + shift) };
    else
      c.layout = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        ...c.layout,
        [axis]: (c.layout?.[axis] || 0) + shift,
      };
  });
}
$("alignHorizontal").onclick = () => centerSelection("x");
$("alignVertical").onclick = () => centerSelection("y");
$("audioMode").onchange = () =>
  edit((c) => {
    c.mono = $("audioMode").value === "mono";
  });
for (const id of [
  "clipStart",
  "clipTrack",
  "trimIn",
  "trimOut",
  "clipVolume",
  "muteClip",
  "monoClip",
  "voiceLevel",
  "layoutX",
  "layoutY",
  "layoutW",
  "layoutH",
  "zoomFrom",
  "zoomTo",
  "zoomX",
  "zoomY",
  "effectX",
  "effectY",
  "effectW",
  "effectH",
  "annotationX",
  "annotationY",
  "textWidth",
]) {
  $(id).closest("label").hidden = true;
}
