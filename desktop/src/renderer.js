"use strict";
const $ = (id) => document.getElementById(id);
let project = { version: 1, media: [], clips: [], music: [] },
  selected = null,
  time = 0,
  scale = 40,
  playing = false,
  activeClip = null;
let history = [],
  future = [],
  audioPlayers = [],
  frame,
  lastTick = 0,
  toastTimer,
  exportBusy = false;
let keys = { split: "s", play: " ", delete: "Delete" };
try {
  keys = { ...keys, ...JSON.parse(localStorage.getItem("crea-keys") || "{}") };
} catch {}
const uid = () => crypto.randomUUID();
const mediaOf = (c) => project.media.find((m) => m.id === c.mediaId);
const allClips = () => [...project.clips, ...project.music];
const chosen = () => allClips().find((c) => c.id === selected);
const isMusic = (c) => project.music.includes(c);
const fmt = (s) => {
  s = Math.max(0, Number(s) || 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 100)).padStart(2, "0")}`;
};
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
  $("status").textContent = message;
}
function checkpoint() {
  history.push(JSON.stringify(project));
  if (history.length > 80) history.shift();
  future = [];
}
function restore(stack, other) {
  if (!stack.length) return;
  pause();
  other.push(JSON.stringify(project));
  project = JSON.parse(stack.pop());
  selected = null;
  time = Math.min(time, Timeline.total(project.clips));
  activeClip = null;
  render();
}
function changed() {
  time = Math.min(time, Timeline.total(project.clips));
  render();
}
function action(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      toast(e.message || String(e));
    }
  };
}
function element(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function render() {
  renderLibrary();
  renderTimeline();
  renderProperties();
  renderPreview(true);
  $("undoBtn").disabled = !history.length;
  $("redoBtn").disabled = !future.length;
}
function renderLibrary() {
  const list = $("mediaList");
  list.replaceChildren();
  $("libraryEmpty").hidden = project.media.length > 0;
  $("mediaCount").textContent = project.media.length;
  for (const m of project.media) {
    const card = element("div", "media-card");
    card.draggable = true;
    card.append(
      element(
        "span",
        "media-icon",
        m.kind === "audio" ? "♫" : m.kind === "image" ? "▧" : "▷",
      ),
    );
    const info = element("div");
    info.append(
      element("strong", "", m.name),
      element(
        "small",
        "",
        `${m.kind === "audio" ? "AUDIO" : m.kind === "image" ? "IMMAGINE" : "VIDEO"} · ${fmt(m.duration)}`,
      ),
    );
    card.append(info);
    const add = element("button", "", "＋");
    add.title = "Aggiungi alla timeline";
    add.onclick = () => addMedia(m.id, time);
    card.append(add);
    card.addEventListener("dblclick", () => addMedia(m.id, time));
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/crea-media", m.id);
      e.dataTransfer.effectAllowed = "copy";
    });
    list.append(card);
  }
}
function addMedia(id, at) {
  const m = project.media.find((m) => m.id === id);
  if (!m) return;
  pause();
  checkpoint();
  const clip = { id: uid(), mediaId: id, in: 0, out: m.duration, volume: 1 };
  if (m.kind === "audio") {
    clip.start = Math.max(0, at);
    project.music.push(clip);
  } else project.clips.push(clip);
  selected = clip.id;
  changed();
}
async function imported(result) {
  if (result.media.length) {
    checkpoint();
    project.media.push(...result.media);
    renderLibrary();
    toast(`${result.media.length} file importati. Trascinali sulla timeline.`);
  }
  if (result.errors.length) toast(result.errors.join("\n"));
}
$("importBtn").onclick = action(async () =>
  imported(await studio.importMedia()),
);
// Native drops use Electron webUtils; paths never come from browser fakepath fields.
window.addEventListener("dragover", (e) => {
  e.preventDefault();
});
window.addEventListener(
  "drop",
  action(async (e) => {
    e.preventDefault();
    if (!e.dataTransfer.files.length) return;
    const files = Array.from(e.dataTransfer.files)
      .map((f) => studio.filePath(f))
      .filter(Boolean);
    await imported(await studio.importPaths(files));
  }),
);
function clipStart(c) {
  if (isMusic(c)) return c.start;
  let start = 0;
  for (const clip of project.clips) {
    if (clip.id === c.id) return start;
    start += Timeline.duration(clip);
  }
  return 0;
}
function renderTimeline() {
  const total = Timeline.total(project.clips),
    maxMusic = Math.max(
      0,
      ...project.music.map((c) => c.start + Timeline.duration(c)),
    );
  const width = Math.max(
    $("timelineScroll").clientWidth,
    Math.ceil((Math.max(total, maxMusic) + 15) * scale),
  );
  $("timeline").style.width = `${width}px`;
  const ruler = $("ruler");
  ruler.replaceChildren();
  const step = scale > 100 ? 1 : scale > 35 ? 5 : scale > 15 ? 10 : 30;
  for (let s = 0; s < width / scale; s += step) {
    const tick = element("span", "tick", fmt(s).slice(0, 5));
    tick.style.left = `${s * scale}px`;
    ruler.append(tick);
  }
  for (const [target, clips] of [
    [$("visualTrack"), project.clips],
    [$("musicTrack"), project.music],
  ]) {
    target.replaceChildren();
    for (const c of clips) {
      const m = mediaOf(c),
        audio = isMusic(c),
        node = element(
          "div",
          `clip${audio ? " audio" : ""}${selected === c.id ? " selected" : ""}`,
        );
      node.dataset.id = c.id;
      node.draggable = true;
      node.style.left = `${clipStart(c) * scale}px`;
      node.style.width = `${Math.max(5, Timeline.duration(c) * scale)}px`;
      node.title = `${m.name} · ${fmt(Timeline.duration(c))}`;
      node.append(
        element(
          "span",
          "clip-name",
          `${audio ? "♫" : m.kind === "image" ? "▧" : "▷"} ${m.name}`,
        ),
        element("span", "clip-duration", fmt(Timeline.duration(c))),
      );
      node.onclick = (e) => {
        e.stopPropagation();
        selected = c.id;
        renderTimeline();
        renderProperties();
      };
      node.addEventListener("dragstart", (e) => {
        if (e.target.classList.contains("handle")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("application/crea-clip", c.id);
        e.dataTransfer.effectAllowed = "move";
      });
      for (const side of ["left", "right"]) {
        const handle = element("span", `handle ${side}`);
        handle.draggable = false;
        handle.addEventListener("pointerdown", (e) => trimDrag(e, c, side));
        node.append(handle);
      }
      target.append(node);
    }
  }
  $("durationLabel").textContent =
    `${project.clips.length} clip · ${fmt(total)}`;
  $("zoomLabel").textContent = `${Math.round(scale)} px/s`;
  $("zoom").value = scale;
  updateHead();
}
function trimDrag(e, c, side) {
  e.preventDefault();
  e.stopPropagation();
  pause();
  selected = c.id;
  const x = e.clientX,
    oldIn = c.in,
    oldOut = c.out,
    oldStart = c.start,
    m = mediaOf(c);
  let dirty = false;
  const move = (event) => {
    const delta = (event.clientX - x) / scale;
    if (!dirty) {
      checkpoint();
      dirty = true;
    }
    if (side === "left") {
      c.in = Math.max(0, Math.min(oldOut - 0.1, oldIn + delta));
      if (isMusic(c)) c.start = Math.max(0, oldStart + c.in - oldIn);
    } else
      c.out = Math.max(
        oldIn + 0.1,
        Math.min(m.kind === "image" ? 86400 : m.duration, oldOut + delta),
      );
    changed();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
for (const [id, audio] of [
  ["visualTrack", false],
  ["musicTrack", true],
]) {
  const track = $(id);
  track.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    track.classList.add("dragover");
  });
  track.addEventListener("dragleave", () => track.classList.remove("dragover"));
  track.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    track.classList.remove("dragover");
    const at = Math.max(
      0,
      (e.clientX - track.getBoundingClientRect().left) / scale,
    );
    const mediaId = e.dataTransfer.getData("application/crea-media"),
      clipId = e.dataTransfer.getData("application/crea-clip");
    if (e.dataTransfer.files.length) {
      window.dispatchEvent(
        new DragEvent("drop", { dataTransfer: e.dataTransfer }),
      );
      return;
    }
    if (mediaId) {
      const m = project.media.find((m) => m.id === mediaId);
      if ((m.kind === "audio") !== audio) {
        toast(
          audio
            ? "Questa traccia accetta musica e audio."
            : "Trascina la musica sulla traccia audio.",
        );
        return;
      }
      addMedia(mediaId, at);
      if (!audio) {
        const c = project.clips.pop();
        insertVisual(c, at);
        changed();
      }
    } else if (clipId) {
      const c = allClips().find((c) => c.id === clipId);
      if (!c || isMusic(c) !== audio) return;
      pause();
      checkpoint();
      if (audio) c.start = at;
      else {
        project.clips = project.clips.filter((v) => v.id !== clipId);
        insertVisual(c, at);
      }
      selected = clipId;
      changed();
    }
  });
  track.addEventListener("pointerdown", (e) => {
    if (e.target === track)
      seek((e.clientX - track.getBoundingClientRect().left) / scale);
  });
}
function insertVisual(c, at) {
  let start = 0,
    index = project.clips.length;
  for (let i = 0; i < project.clips.length; i++) {
    const d = Timeline.duration(project.clips[i]);
    if (at < start + d / 2) {
      index = i;
      break;
    }
    start += d;
  }
  project.clips.splice(index, 0, c);
}
$("ruler").addEventListener("pointerdown", (e) => {
  pause();
  const move = (event) =>
    seek((event.clientX - $("ruler").getBoundingClientRect().left) / scale);
  move(e);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});
function setZoom(value, anchor = $("timelineScroll").clientWidth / 2) {
  const sc = $("timelineScroll"),
    point = (sc.scrollLeft + anchor) / scale;
  scale = Math.max(8, Math.min(240, Number(value)));
  renderTimeline();
  sc.scrollLeft = point * scale - anchor;
}
$("timelineScroll").addEventListener(
  "wheel",
  (e) => {
    if (e.shiftKey) {
      e.preventDefault();
      const anchor =
        e.clientX - $("timelineScroll").getBoundingClientRect().left;
      setZoom(scale * Math.exp(-e.deltaY * 0.002), anchor);
    } else if (e.ctrlKey) {
      e.preventDefault();
      $("timelineScroll").scrollLeft += e.deltaY || e.deltaX;
    }
  },
  { passive: false },
);
$("zoom").oninput = (e) => setZoom(e.target.value);
$("zoomIn").onclick = () => setZoom(scale * 1.25);
$("zoomOut").onclick = () => setZoom(scale / 1.25);
function renderProperties() {
  const c = chosen();
  $("noSelection").hidden = !!c;
  $("clipProperties").hidden = !c;
  if (!c) return;
  const m = mediaOf(c);
  $("selectedName").textContent = m.name;
  $("trimIn").value = c.in.toFixed(2);
  $("trimOut").value = c.out.toFixed(2);
  $("trimIn").disabled = m.kind === "image";
  $("offsetLabel").hidden = !isMusic(c);
  $("musicStart").value = c.start || 0;
  $("clipVolume").value = c.volume * 100;
  $("clipVolume").disabled = m.kind === "image";
  $("volumeValue").textContent = `${Math.round(c.volume * 100)}%`;
  $("splitBtn").textContent = `✂ Dividi · ${keyName(keys.split)}`;
}
function editTrim() {
  const c = chosen();
  if (!c) return;
  const m = mediaOf(c),
    a = Number($("trimIn").value),
    b = Number($("trimOut").value),
    start = Number($("musicStart").value);
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a < 0 ||
    b - a < 0.05 ||
    b > (m.kind === "image" ? 86400 : m.duration) ||
    !Number.isFinite(start) ||
    start < 0
  ) {
    toast("Intervallo non valido: controlla inizio e fine della clip.");
    renderProperties();
    return;
  }
  pause();
  checkpoint();
  c.in = a;
  c.out = b;
  if (isMusic(c)) c.start = start;
  changed();
}
$("trimIn").onchange = editTrim;
$("trimOut").onchange = editTrim;
$("musicStart").onchange = editTrim;
$("clipVolume").addEventListener("pointerdown", () => checkpoint());
$("clipVolume").oninput = (e) => {
  const c = chosen();
  if (c) {
    c.volume = Number(e.target.value) / 100;
    $("volumeValue").textContent = `${e.target.value}%`;
    syncAudio();
    renderPreview();
  }
};
$("clipVolume").addEventListener("keydown", (e) => {
  if (e.key.startsWith("Arrow")) checkpoint();
});
function split() {
  const c = chosen();
  if (!c) return toast("Seleziona una clip da dividere.");
  pause();
  const before = JSON.stringify(project);
  let ok;
  if (isMusic(c)) {
    const offset = time - c.start,
      d = Timeline.duration(c);
    ok = offset >= 0.05 && offset <= d - 0.05;
    if (ok) {
      const cut = c.in + offset;
      project.music.push({ ...c, id: uid(), in: cut, start: time });
      c.out = cut;
    }
  } else ok = Timeline.split(project.clips, c.id, time, uid());
  if (!ok) return toast("Porta il cursore all’interno della clip selezionata.");
  history.push(before);
  future = [];
  changed();
}
function remove() {
  if (!chosen()) return;
  pause();
  checkpoint();
  project.clips = project.clips.filter((c) => c.id !== selected);
  project.music = project.music.filter((c) => c.id !== selected);
  selected = null;
  activeClip = null;
  changed();
}
$("splitBtn").onclick = split;
$("cutTool").onclick = split;
$("deleteBtn").onclick = remove;
$("deleteTool").onclick = remove;
$("undoBtn").onclick = () => restore(history, future);
$("redoBtn").onclick = () => restore(future, history);
function updateHead() {
  $("playhead").style.left = `${time * scale}px`;
  $("timecode").replaceChildren(
    document.createTextNode(fmt(time) + " "),
    element("em", "", `/ ${fmt(Timeline.total(project.clips))}`),
  );
}
function seek(value) {
  const was = playing;
  pause();
  time = Math.max(0, Math.min(Timeline.total(project.clips), value));
  activeClip = null;
  renderPreview(true);
  updateHead();
  revealHead();
  if (was && time < Timeline.total(project.clips)) play();
}
function renderPreview(force = false) {
  const hit = Timeline.locate(
      project.clips,
      Math.min(time, Math.max(0, Timeline.total(project.clips) - 0.001)),
    ),
    video = $("previewVideo"),
    image = $("previewImage");
  $("stageEmpty").hidden = !!hit;
  if (!hit) {
    video.pause();
    video.style.display = "none";
    image.style.display = "none";
    activeClip = null;
    return;
  }
  const m = mediaOf(hit.clip),
    isNew = activeClip !== hit.clip.id;
  image.style.display = m.kind === "image" ? "block" : "none";
  video.style.display = m.kind === "video" ? "block" : "none";
  if (m.kind === "image") {
    video.pause();
    if (isNew) image.src = m.url;
  } else {
    if (isNew) {
      video.src = m.url;
      video.load();
    }
    video.volume = Math.min(1, hit.clip.volume);
    video.muted = hit.clip.volume === 0;
    if (isNew || force || Math.abs(video.currentTime - hit.local) > 0.35)
      video.currentTime = hit.local;
    if (playing && video.paused)
      video.play().catch((e) => {
        if (e.name !== "AbortError") {
          pause();
          toast(
            "Anteprima non riproducibile: " +
              e.message +
              " Puoi comunque tentare l’esportazione con FFmpeg.",
          );
        }
      });
  }
  activeClip = hit.clip.id;
}
function syncAudio(force = false) {
  const ids = new Set(project.music.map((c) => c.id));
  audioPlayers = audioPlayers.filter(({ id, audio }) => {
    if (!ids.has(id)) {
      audio.pause();
      return false;
    }
    return true;
  });
  for (const c of project.music) {
    let entry = audioPlayers.find((a) => a.id === c.id);
    if (!entry) {
      entry = { id: c.id, audio: new Audio(mediaOf(c).url) };
      audioPlayers.push(entry);
    }
    const a = entry.audio,
      local = c.in + time - c.start,
      inside = time >= c.start && time < c.start + Timeline.duration(c);
    a.volume = Math.min(1, c.volume);
    if (inside) {
      if (force || Math.abs(a.currentTime - local) > 0.3) a.currentTime = local;
      if (playing && a.paused) a.play().catch(() => {});
    } else a.pause();
  }
}
function revealHead() {
  const sc = $("timelineScroll"),
    x = time * scale;
  if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 25)
    sc.scrollLeft = Math.max(0, x - 30);
}
function play() {
  if (!project.clips.length)
    return toast("Aggiungi una clip video o un’immagine alla timeline.");
  if (time >= Timeline.total(project.clips)) time = 0;
  playing = true;
  lastTick = performance.now();
  $("playBtn").textContent = "Ⅱ";
  renderPreview(true);
  syncAudio(true);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(tick);
}
function pause() {
  playing = false;
  cancelAnimationFrame(frame);
  $("previewVideo").pause();
  audioPlayers.forEach((a) => a.audio.pause());
  $("playBtn").textContent = "▶";
}
function tick(now) {
  if (!playing) return;
  time += (now - lastTick) / 1000;
  lastTick = now;
  const total = Timeline.total(project.clips);
  if (time >= total) {
    time = total;
    pause();
  }
  renderPreview();
  syncAudio();
  updateHead();
  if (playing) {
    revealHead();
    frame = requestAnimationFrame(tick);
  }
}
$("playBtn").onclick = () => (playing ? pause() : play());
$("toStart").onclick = () => seek(0);
$("toEnd").onclick = () => seek(Timeline.total(project.clips));
$("saveProject").onclick = action(async () => {
  if (await studio.saveProject(project))
    toast(
      "Progetto salvato. Conserva anche i file originali nei loro percorsi.",
    );
});
$("openProject").onclick = action(async () => {
  if (
    project.media.length &&
    !confirm(
      "Aprire un progetto? Le modifiche non salvate verranno sostituite.",
    )
  )
    return;
  const loaded = await studio.openProject();
  if (loaded) {
    pause();
    project = loaded;
    history = [];
    future = [];
    selected = null;
    time = 0;
    activeClip = null;
    audioPlayers.forEach((a) => a.audio.pause());
    audioPlayers = [];
    render();
    toast("Progetto aperto.");
  }
});
function keyName(key) {
  return key === " " ? "Spazio" : key === "Delete" ? "Canc" : key.toUpperCase();
}
function renderKeys() {
  for (const name of ["split", "play", "delete"])
    $("key" + name[0].toUpperCase() + name.slice(1)).value = keyName(
      keys[name],
    );
}
$("keysBtn").onclick = () => {
  renderKeys();
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
      return toast("Questo tasto è già assegnato.");
    keys[name] = key;
    localStorage.setItem("crea-keys", JSON.stringify(keys));
    renderKeys();
    renderProperties();
  };
$("resetKeys").onclick = () => {
  keys = { split: "s", play: " ", delete: "Delete" };
  localStorage.setItem("crea-keys", JSON.stringify(keys));
  renderKeys();
  renderProperties();
};
document.addEventListener("keydown", (e) => {
  if (
    document.querySelector("dialog[open]") ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
    e.target.isContentEditable
  )
    return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if ((e.ctrlKey || e.metaKey) && k === "z") {
    e.preventDefault();
    restore(e.shiftKey ? future : history, e.shiftKey ? history : future);
  } else if ((e.ctrlKey || e.metaKey) && k === "s") {
    e.preventDefault();
    $("saveProject").click();
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (k === keys.split) {
      e.preventDefault();
      split();
    } else if (k === keys.play) {
      e.preventDefault();
      playing ? pause() : play();
    } else if (k === keys.delete) {
      e.preventDefault();
      remove();
    }
  }
});
$("exportBtn").onclick = () => {
  if (!project.clips.length)
    return toast("Aggiungi almeno una clip alla timeline.");
  pause();
  $("exportDialog").showModal();
};
studio.onProgress((p) => {
  $("exportProgress").value = p.percent;
  $("exportStatus").textContent = p.message;
});
$("exportDialog").addEventListener("cancel", (e) => {
  if (exportBusy) e.preventDefault();
});
$("exportDialog").addEventListener("submit", (e) => {
  if (exportBusy) e.preventDefault();
});
$("doExport").onclick = action(async () => {
  exportBusy = true;
  $("doExport").disabled = true;
  $("cancelExport").hidden = false;
  $("exportProgress").value = 0;
  $("exportStatus").textContent = "Preparazione esportazione…";
  try {
    const result = await studio.exportVideo(project, {
      height: Number($("exportHeight").value),
      fps: Number($("exportFps").value),
      quality: $("exportQuality").value,
    });
    $("exportStatus").textContent = result
      ? "Salvato in " + result
      : "Esportazione annullata";
    if (result) toast("Video MP4 esportato.");
  } catch (e) {
    $("exportStatus").textContent = e.message.includes("aborted")
      ? "Esportazione annullata"
      : e.message;
  } finally {
    exportBusy = false;
    $("doExport").disabled = false;
    $("cancelExport").hidden = true;
  }
});
$("cancelExport").onclick = () => studio.cancelExport();
let recordingFinishing = false,
  recorder = null,
  captureStreams = [],
  recordContext = null,
  recordTimer,
  recordStarted;
function stopCapture() {
  captureStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  captureStreams = [];
  recordContext?.close();
  recordContext = null;
  clearInterval(recordTimer);
  $("recordingBar").hidden = true;
  recorder = null;
}
async function showRecording() {
  if (recorder || recordingFinishing)
    return toast("Una registrazione è già in corso o in salvataggio.");
  const sources = await studio.sources();
  $("captureSource").replaceChildren();
  for (const s of sources) {
    const option = element("option", "", s.name);
    option.value = s.id;
    $("captureSource").append(option);
  }
  if (!sources.length)
    return toast("Nessuno schermo disponibile per la registrazione.");
  const windows = (await studio.platform()) === "win32";
  $("systemAudio").disabled = !windows;
  if (!windows) $("systemAudio").checked = false;
  $("recordDialog").showModal();
}
$("recordBtn").onclick = action(showRecording);
$("railRecord").onclick = action(showRecording);
$("startRecording").onclick = action(async () => {
  $("startRecording").disabled = true;
  try {
    const systemAudio = $("systemAudio").checked;
    await studio.chooseSource({ id: $("captureSource").value, systemAudio });
    const height = Number($("recordHeight").value),
      fps = Number($("recordFps").value);
    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: { height: { max: height }, frameRate: { ideal: fps, max: fps } },
      audio: systemAudio,
    });
    captureStreams.push(screen);
    const audioTracks = [];
    if (systemAudio && screen.getAudioTracks().length) audioTracks.push(screen);
    else if (systemAudio)
      toast(
        "Audio del computer non disponibile: la registrazione prosegue senza audio di sistema.",
      );
    if ($("microphone").checked) {
      const mic = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      captureStreams.push(mic);
      audioTracks.push(mic);
    }
    const mixed = new MediaStream(screen.getVideoTracks());
    if (audioTracks.length) {
      recordContext = new AudioContext();
      const dest = recordContext.createMediaStreamDestination();
      for (const stream of audioTracks)
        recordContext.createMediaStreamSource(stream).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => mixed.addTrack(t));
      await recordContext.resume();
    }
    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime)
      throw Error("Registrazione WebM non supportata da questo sistema.");
    await studio.beginRecording();
    let writeQueue = Promise.resolve(),
      writeError = null;
    recorder = new MediaRecorder(mixed, {
      mimeType: mime,
      videoBitsPerSecond: Number($("recordBitrate").value),
      audioBitsPerSecond: Number($("recordAudioBitrate").value),
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size)
        writeQueue = writeQueue
          .then(async () => studio.appendRecording(await e.data.arrayBuffer()))
          .catch((error) => {
            writeError = error;
            if (recorder?.state === "recording") recorder.stop();
          });
    };
    recorder.onstop = async () => {
      recordingFinishing = true;
      stopCapture();
      try {
        await writeQueue;
        if (writeError) throw writeError;
        toast("Scegli dove salvare la registrazione…");
        const m = await studio.finishRecording();
        if (m) {
          checkpoint();
          project.media.push(m);
          renderLibrary();
          toast("Registrazione salvata e aggiunta alla libreria.");
        }
      } catch (e) {
        await studio.abortRecording();
        toast(e.message);
      } finally {
        recordingFinishing = false;
      }
    };
    recorder.onerror = (e) => {
      toast(
        "Errore registrazione: " +
          (e.error?.message || "acquisizione interrotta"),
      );
      if (recorder?.state !== "inactive") recorder.stop();
    };
    screen.getVideoTracks()[0].onended = () => {
      if (recorder?.state === "recording") recorder.stop();
    };
    recorder.start(1000);
    recordStarted = Date.now();
    $("recordDialog").close();
    $("recordingBar").hidden = false;
    recordTimer = setInterval(
      () =>
        ($("recordingTime").textContent =
          "Registrazione · " + fmt((Date.now() - recordStarted) / 1000)),
      500,
    );
    toast("Registrazione avviata.");
  } catch (e) {
    stopCapture();
    await studio.abortRecording();
    throw e;
  } finally {
    $("startRecording").disabled = false;
  }
});
$("stopRecording").onclick = () => {
  if (recorder?.state === "recording") {
    recorder.stop();
    $("stopRecording").disabled = true;
    setTimeout(() => ($("stopRecording").disabled = false), 1000);
  }
};
window.addEventListener("beforeunload", (e) => {
  if (recorder || recordingFinishing || exportBusy) {
    e.preventDefault();
    e.returnValue = "Operazione in corso";
  }
});
window.addEventListener("resize", () => renderTimeline());
render();
