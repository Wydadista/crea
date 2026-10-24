"use strict";
// Editor 0.4: compact presentation is independent from composition tracks.
let elementColumns = Math.max(
  1,
  Math.min(4, Number(localStorage.getItem("akhbar-element-columns")) || 2),
);
const expandedClips = new Set();
const originalRenderTimeline = renderTimeline,
  originalLibrary = renderLibrary,
  originalProperties = properties;
function applyElementColumns() {
  $("elementsPanel").style.setProperty("--element-columns", elementColumns);
  $("elementColumns").textContent = elementColumns;
  $("elementSmaller").disabled = elementColumns === 4;
  $("elementLarger").disabled = elementColumns === 1;
  localStorage.setItem("akhbar-element-columns", elementColumns);
}
$("elementSmaller").onclick = () => {
  elementColumns = Math.min(4, elementColumns + 1);
  applyElementColumns();
};
$("elementLarger").onclick = () => {
  elementColumns = Math.max(1, elementColumns - 1);
  applyElementColumns();
};
applyElementColumns();
async function removeLibraryMedia(id) {
  const used = Timeline.allClips(project).filter(
    (c) => c.mediaId === id,
  ).length;
  if (
    used &&
    (await showAppDialog({
      title: "Rimuovere il media dal progetto?",
      message: `Il media è usato da ${used} elementi. Verranno rimossi anche questi elementi dalla timeline.`,
      detail: "Il file originale sul disco non viene cancellato.",
      buttons: ["Rimuovi dal progetto", "Annulla"],
      cancelId: 1,
      defaultId: 1,
    })) !== 0
  )
    return;
  pause();
  checkpoint();
  project.clips = project.clips.filter((c) => c.mediaId !== id);
  for (const c of project.clips)
    c.attachments = c.attachments?.filter((a) => a.mediaId !== id);
  project.media = project.media.filter((m) => m.id !== id);
  selectedMediaId = null;
  selection.clear();
  resetPlayers();
  render();
}
renderLibrary = function () {
  originalLibrary();
  for (const card of $("mediaList").children) {
    const button = el("button", "remove-media", "×");
    button.title = "Rimuovi dal progetto";
    button.setAttribute(
      "aria-label",
      "Rimuovi " +
        project.media.find((m) => m.id === card.dataset.mediaId)?.name,
    );
    button.onclick = (e) => {
      e.stopPropagation();
      safe(() => removeLibraryMedia(card.dataset.mediaId))();
    };
    card.append(button);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Delete") {
        e.preventDefault();
        e.stopPropagation();
        safe(() => removeLibraryMedia(card.dataset.mediaId))();
      }
    });
    card.oncontextmenu = (e) => {
      e.preventDefault();
      safe(() => removeLibraryMedia(card.dataset.mediaId))();
    };
  }
};
function decoration(type, parent) {
  const annotationType = ["text", "arrow", "circle"].includes(type);
  const m = {
    id: uid(),
    name: {
      text: "Testo",
      arrow: "Freccia",
      circle: "Cerchio",
      blur: "Sfocatura",
      pixel: "Pixelizzazione",
    }[type],
    kind: annotationType ? "annotation" : "effect",
    duration: 86400,
    hasAudio: false,
  };
  const a = {
    id: uid(),
    parentId: parent.id,
    mediaId: m.id,
    sourceIn: parent.in,
    sourceOut: parent.out,
    start: parent.start,
    in: 0,
    out: Timeline.duration(parent),
    speed: 1,
    volume: 0,
    aspectUnlocked: true,
  };
  if (annotationType)
    a.annotation = {
      type,
      text: "Il tuo testo",
      font: "Arial",
      size: 64,
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 0,
      background: "#15191f",
      backgroundEnabled: false,
      x: 50,
      y: 50,
      length: 30,
      angle: 0,
      lineWidth: 10,
      animate: 0,
    };
  else
    a.effect = {
      type,
      strength: 25,
      x: 25,
      y: 25,
      width: 50,
      height: 50,
      shape: "rect",
    };
  return { a, m };
}
function attachElement(parent, type) {
  if ((parent.attachments?.length || 0) >= 64)
    return toast("Massimo 64 elementi applicati a una clip");
  checkpoint();
  const { a, m } = decoration(type, parent);
  project.media.push(m);
  (parent.attachments ||= []).push(a);
  expandedClips.add(parent.id);
  selection = new Set([a.id]);
  previewFocus = a.id;
  changed();
}
function editInterval(e, parent, a, part, bar) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pause();
  const before = clone(project),
    x = e.clientX,
    old = clone(a),
    span = parent.out - parent.in,
    width = bar.parentElement.getBoundingClientRect().width;
  const keys = old.zoomKeys; // Zoom arrows and effect bars share the same source-time ruler.
  const move = (ev) => {
    const d = ((ev.clientX - x) / Math.max(1, width)) * span;
    if (keys) {
      const lo =
        part === "left"
          ? Math.max(
              parent.in,
              Math.min(old.sourceOut - 0.01, old.sourceIn + d),
            )
          : old.sourceIn;
      const hi =
        part === "right"
          ? Math.min(parent.out, Math.max(lo + 0.01, old.sourceOut + d))
          : old.sourceOut;
      parent.zoom.keys = keys.map((k) => ({
        ...k,
        time:
          lo +
          ((k.time - old.sourceIn) / (old.sourceOut - old.sourceIn)) *
            (hi - lo),
      }));
      a.sourceIn = lo;
      a.sourceOut = hi;
    } else if (part === "left")
      a.sourceIn = Math.max(
        parent.in,
        Math.min(old.sourceOut - 0.001, old.sourceIn + d),
      );
    else if (part === "right")
      a.sourceOut = Math.min(
        parent.out,
        Math.max(old.sourceIn + 0.001, old.sourceOut + d),
      );
    else {
      const shift = Math.max(
        parent.in - old.sourceIn,
        Math.min(parent.out - old.sourceOut, d),
      );
      a.sourceIn = old.sourceIn + shift;
      a.sourceOut = old.sourceOut + shift;
    }
    bar.style.left =
      ((Math.max(a.sourceIn, parent.in) - parent.in) / span) * 100 + "%";
    bar.style.width =
      ((Math.min(a.sourceOut, parent.out) - Math.max(a.sourceIn, parent.in)) /
        span) *
        100 +
      "%";
    draw();
  };
  captureMove(e, move, (ev) => {
    if (ev.type === "pointercancel") project = before;
    else {
      move(ev);
      if (JSON.stringify(project) !== JSON.stringify(before)) {
        history.push(JSON.stringify(before));
        future = [];
      }
    }
    changed();
  });
}
function intervalBar(parent, a, container, label, zoom = false) {
  const lo = Math.max(parent.in, a.sourceIn),
    hi = Math.min(parent.out, a.sourceOut);
  if (hi <= lo) return;
  const row = el("div", "attachment-row"),
    bar = el("div", "attachment-bar" + (zoom ? " zoom-motion" : ""), label);
  row.append(bar);
  container.append(row);
  bar.title = label + " · trascina le estremità per la durata";
  bar.style.left = ((lo - parent.in) / (parent.out - parent.in)) * 100 + "%";
  bar.style.width = ((hi - lo) / (parent.out - parent.in)) * 100 + "%";
  bar.onpointerdown = (e) => {
    if (!zoom) {
      selection = new Set([a.id]);
      previewFocus = a.id;
      properties();
      draw();
    }
    editInterval(e, parent, a, "move", bar);
  };
  for (const side of ["left", "right"]) {
    const h = el("span", "interval-handle " + side);
    h.onpointerdown = (e) => editInterval(e, parent, a, side, bar);
    bar.append(h);
  }
  if (!zoom)
    bar.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      checkpoint();
      parent.attachments = parent.attachments.filter((x) => x.id !== a.id);
      selection = new Set([parent.id]);
      changed();
    };
}
renderTimeline = function () {
  originalRenderTimeline();
  for (const node of document.querySelectorAll(".clip[data-id]")) {
    const c = project.clips.find((c) => c.id === node.dataset.id);
    if (!c) continue;
    if (c.linkId) {
      node.classList.add("compact-group");
      continue;
    }
    node.ondragover = (e) => {
      if (draggedElement) {
        e.preventDefault();
        e.stopPropagation();
        node.classList.add("attach-target");
      }
    };
    node.ondragleave = () => node.classList.remove("attach-target");
    node.ondrop = (e) => {
      const type = e.dataTransfer.getData("application/akhbar-element");
      if (type) {
        e.preventDefault();
        e.stopPropagation();
        node.classList.remove("attach-target");
        attachElement(c, type);
      }
    };
    const count = (c.attachments?.length || 0) + (c.zoom?.keys?.length ? 1 : 0);
    if (!count) continue;
    const toggle = el(
      "button",
      "expand-clip",
      expandedClips.has(c.id) ? "▾" : "▸",
    );
    toggle.title = "Mostra/nascondi testi, effetti e movimenti";
    toggle.setAttribute("aria-expanded", String(expandedClips.has(c.id)));
    toggle.onpointerdown = (e) => e.stopPropagation();
    toggle.onclick = (e) => {
      e.stopPropagation();
      expandedClips.has(c.id)
        ? expandedClips.delete(c.id)
        : expandedClips.add(c.id);
      renderTimeline();
    };
    node.append(toggle);
    node.classList.toggle(
      "selected",
      (c.attachments || []).some((a) => selection.has(a.id)) ||
        selection.has(c.id),
    );
    if (!expandedClips.has(c.id)) continue;
    const list = el("div", "attachment-list");
    node.append(list);
    for (const a of c.attachments || [])
      intervalBar(
        c,
        a,
        list,
        project.media.find((m) => m.id === a.mediaId)?.name || "Elemento",
      );
    if (c.zoom?.keys?.length) {
      const a = {
        sourceIn: c.zoom.keys[0].time,
        sourceOut: c.zoom.keys.at(-1).time,
        zoomKeys: clone(c.zoom.keys),
      };
      intervalBar(c, a, list, "↗ Inquadratura ↘", true);
    }
    const height = Math.max(parseFloat(node.style.height), 38 + count * 15);
    node.style.height = height + "px";
    const track = $("track" + c.track),
      label = document.querySelector(`[data-choose-track="${c.track}"]`);
    track.style.height =
      Math.max(parseFloat(track.style.height), height + 12) + "px";
    if (label) label.style.height = track.style.height;
  }
  installInsertHandlers();
};
const insertionGuide = el("div", "insertion-guide");
insertionGuide.hidden = true;
document.body.append(insertionGuide);
function installInsertHandlers() {
  for (const row of document.querySelectorAll(".track")) {
    if (row.dataset.insertBound) return;
    row.dataset.insertBound = "true";
    const point = (e) => {
      const id =
        e.dataTransfer.getData("application/crea-media") || draggedMedia;
      if (!id || draggedElement) return null;
      const at = Timeline.insertionPoint(
        project,
        Number(row.dataset.track),
        Math.max(0, (e.clientX - row.getBoundingClientRect().left) / scale),
        14 / scale,
      );
      return at === null ? null : { id, at };
    };
    row.addEventListener(
      "dragover",
      (e) => {
        const found = point(e);
        insertionGuide.hidden = !found;
        if (!found) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        document.querySelectorAll(".drop-ghost").forEach((n) => n.remove());
        const r = row.getBoundingClientRect();
        Object.assign(insertionGuide.style, {
          left: r.left + found.at * scale + "px",
          top: r.top + "px",
          height: r.height + "px",
        });
      },
      true,
    );
    row.addEventListener(
      "drop",
      (e) => {
        insertionGuide.hidden = true;
        const found = point(e);
        if (!found) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        safe(() => {
          const m = project.media.find((m) => m.id === found.id);
          const d =
            m.kind === "image" ? workspacePrefs.imageDuration : m.duration;
          const c = {
            id: uid(),
            mediaId: m.id,
            sourceInstanceId: uid(),
            track: Number(row.dataset.track),
            start: found.at,
            in: 0,
            out: d,
            speed: 1,
            volume: 1,
            ...(m.hasAudio ? { mono: true } : {}),
          };
          const result = Timeline.insertMedia(project, c, found.at);
          checkpoint();
          project = result;
          selection = new Set([c.id]);
          changed();
        })();
      },
      true,
    );
    row.addEventListener("dragleave", () => {
      insertionGuide.hidden = true;
    });
  }
}
window.addEventListener("dragend", () => {
  insertionGuide.hidden = true;
});
const originalRemove = remove;
remove = function () {
  const childIds = new Set(
    selected()
      .filter((c) => c.parentId)
      .map((c) => c.id),
  );
  if (!childIds.size) return originalRemove();
  checkpoint();
  for (const c of project.clips)
    c.attachments = c.attachments?.filter((a) => !childIds.has(a.id));
  selection.clear();
  changed();
};
// Text styles never include content, duration, placement or animation.
let textStyles = [];
try {
  textStyles = JSON.parse(localStorage.getItem("akhbar-text-styles") || "[]");
} catch {}
const styleKeys = [
  "font",
  "size",
  "color",
  "background",
  "backgroundEnabled",
  "strokeWidth",
  "strokeColor",
];
function refreshTextStyles() {
  const select = $("textStyles");
  select.replaceChildren(new Option("Scegli uno stile…", ""));
  for (const [i, s] of textStyles.entries())
    select.append(new Option(s.name, String(i)));
}
$("saveTextStyle").onclick = () => {
  const c = first();
  if (!c?.annotation || c.annotation.type !== "text") return;
  const name =
    $("textStyleName").value.trim() || `Stile ${textStyles.length + 1}`;
  const style = { name };
  for (const k of styleKeys) style[k] = c.annotation[k];
  const old = textStyles.findIndex((s) => s.name === name);
  if (old < 0) textStyles.push(style);
  else textStyles[old] = style;
  localStorage.setItem("akhbar-text-styles", JSON.stringify(textStyles));
  refreshTextStyles();
  toast("Stile salvato");
};
$("applyTextStyle").onclick = () => {
  const style = textStyles[Number($("textStyles").value)];
  if (!style || $("textStyles").value === "") return;
  edit((c) => {
    if (c.annotation?.type === "text")
      for (const key of styleKeys)
        if (style[key] !== undefined) c.annotation[key] = style[key];
  });
};
for (const id of ["textStrokeWidth", "textStrokeColor"])
  $(id).onchange = () =>
    edit((c) => {
      if (c.annotation?.type === "text") {
        c.annotation.strokeWidth = Number($("textStrokeWidth").value);
        c.annotation.strokeColor = $("textStrokeColor").value;
      }
    });
$("effectShape").onchange = () =>
  edit((c) => {
    if (c.effect) {
      c.effect.shape = $("effectShape").value;
      if (c.effect.shape === "circle") {
        const size = Timeline.projectSize(project),
          e = c.effect,
          d = Math.min(e.width * size.width, e.height * size.height),
          w = d / size.width,
          h = d / size.height;
        e.x = Math.max(0, Math.min(100 - w, e.x + (e.width - w) / 2));
        e.y = Math.max(0, Math.min(100 - h, e.y + (e.height - h) / 2));
        e.width = w;
        e.height = h;
      }
    }
  });
properties = function () {
  originalProperties();
  const c = first();
  if (!c) return;
  $("effectShape").value = c.effect?.shape || "rect";
  $("textStrokeWidth").value = c.annotation?.strokeWidth || 0;
  $("textStrokeColor").value = c.annotation?.strokeColor || "#000000";
  $("trimIn").disabled = $("trimOut").disabled =
    !!c.parentId || selected().length > 1;
  if (!document.activeElement?.closest("#motionControls")) {
    const keys = c.zoom?.keys,
      d = Timeline.duration(c);
    $("motionStart").value = keys ? (keys[0].time - c.in) / (c.speed || 1) : 0;
    $("motionEnter").value = keys
      ? (keys[1].time - c.in) / (c.speed || 1)
      : d * 0.25;
    $("motionHold").value = keys
      ? (keys[2].time - c.in) / (c.speed || 1)
      : d * 0.75;
    $("motionEnd").value = keys
      ? (keys.at(-1).time - c.in) / (c.speed || 1)
      : d;
    $("motionFromX").value = (keys?.[0].x ?? c.zoom?.x ?? 0.5) * 100;
    $("motionFromY").value = (keys?.[0].y ?? c.zoom?.y ?? 0.5) * 100;
    $("motionToX").value = (keys?.[1].x ?? c.zoom?.x ?? 0.5) * 100;
    $("motionToY").value = (keys?.[1].y ?? c.zoom?.y ?? 0.5) * 100;
  }
};
function applyMotion() {
  const c = first();
  if (!c || !["video", "image"].includes(mediaOf(c).kind)) return;
  const times = ["motionStart", "motionEnter", "motionHold", "motionEnd"].map(
    (id) => Number($(id).value),
  );
  if (
    times.some(
      (t, i) =>
        !Number.isFinite(t) ||
        t < 0 ||
        t > Timeline.duration(c) ||
        (i && t <= times[i - 1]),
    )
  )
    return toast("Scegli quattro tempi crescenti entro la durata della clip");
  const from = Number($("zoomFrom").value) || 1,
    to = Number($("zoomTo").value) || 2,
    fx = Number($("motionFromX").value) / 100,
    fy = Number($("motionFromY").value) / 100,
    tx = Number($("motionToX").value) / 100,
    ty = Number($("motionToY").value) / 100;
  edit((c) => {
    c.zoom = {
      from,
      to,
      x: tx,
      y: ty,
      keys: times.map((t, i) => ({
        time: c.in + t * (c.speed || 1),
        scale: i === 1 || i === 2 ? to : from,
        x: i === 1 || i === 2 ? tx : fx,
        y: i === 1 || i === 2 ? ty : fy,
      })),
    };
  });
  expandedClips.add(c.id);
  renderTimeline();
}
for (const id of ["zoomFrom", "zoomTo", "zoomX", "zoomY"])
  $(id).onchange = () =>
    edit((c) => {
      const old = c.zoom,
        from = Number($("zoomFrom").value),
        to = Number($("zoomTo").value),
        x = Number($("zoomX").value) / 100,
        y = Number($("zoomY").value) / 100;
      c.zoom = {
        from,
        to,
        x,
        y,
        ...(old?.keys
          ? {
              keys: old.keys.map((k, i) => ({
                ...k,
                scale: i === 0 || i === old.keys.length - 1 ? from : to,
                ...(i === 1 || i === 2 ? { x, y } : {}),
              })),
            }
          : {}),
      };
    });
const baseVisualZoom = $("visualZoom").oninput;
$("visualZoom").oninput = () => {
  const c = first(),
    keys = c?.zoom?.keys ? clone(c.zoom.keys) : null;
  baseVisualZoom();
  if (keys && c) {
    c.zoom.keys = keys.map((k, i) =>
      i === 1 || i === 2 ? { ...k, scale: Number($("visualZoom").value) } : k,
    );
    draw();
  }
};
$("applyMotion").onclick = applyMotion;
$("removeMotion").onclick = () =>
  edit((c) => {
    delete c.zoom;
  });
let frameEditing = false;
function focusMotionEndpoint() {
  const c = first();
  if (!c) return;
  const end = $("motionEndpoint").value === "end";
  const at = c.zoom?.keys?.[end ? 1 : 0]?.time ?? (end ? c.out - 0.001 : c.in);
  seek(c.start + Math.max(0, at - c.in) / (c.speed || 1));
}
$("motionEndpoint").onchange = () => {
  if (frameEditing) focusMotionEndpoint();
};
$("pickZoomFrame").onclick = () => {
  frameEditing = !frameEditing;
  $("pickZoomFrame").setAttribute("aria-pressed", String(frameEditing));
  if (frameEditing) focusMotionEndpoint();
  toast(
    frameEditing
      ? "Clicca il dettaglio, oppure trascina per inquadrare. Premi di nuovo il pulsante per terminare."
      : "Inquadratura impostata",
  );
};
$("previewCanvas").addEventListener(
  "pointerdown",
  (e) => {
    if (!frameEditing || e.button !== 0) return;
    const c = first();
    if (!c || !["video", "image"].includes(mediaOf(c).kind)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pause();
    const r = previewRect(),
      before = clone(project),
      initial = clone(c.zoom || { from: 1, to: 2, x: 0.5, y: 0.5 }),
      x = e.clientX,
      y = e.clientY,
      endpoint = $("motionEndpoint").value;
    const originalX =
        endpoint === "start"
          ? Number($("motionFromX").value) / 100
          : Number($("motionToX").value) / 100,
      originalY =
        endpoint === "start"
          ? Number($("motionFromY").value) / 100
          : Number($("motionToY").value) / 100;
    const oldFrame = Timeline.zoomAt(c, Timeline.sourceTime(c, time)),
      targetZoom = endpoint === "start" ? initial.from : initial.to;
    const update = (ev) => {
      const isMove = Math.abs(ev.clientX - x) + Math.abs(ev.clientY - y) > 3;
      const ox =
          endpoint === "start"
            ? Number($("motionFromX").value) / 100
            : Number($("motionToX").value) / 100,
        oy =
          endpoint === "start"
            ? Number($("motionFromY").value) / 100
            : Number($("motionToY").value) / 100;
      const fraction = Math.max(0.001, 1 - 1 / Math.max(1.001, targetZoom));
      const clickX =
          (1 - 1 / oldFrame.scale) * oldFrame.x +
          (x - r.left) / r.width / oldFrame.scale,
        clickY =
          (1 - 1 / oldFrame.scale) * oldFrame.y +
          (y - r.top) / r.height / oldFrame.scale;
      const nx = Math.max(
          0,
          Math.min(
            1,
            isMove
              ? originalX - (ev.clientX - x) / r.width / fraction
              : (clickX - 0.5 / targetZoom) / fraction,
          ),
        ),
        ny = Math.max(
          0,
          Math.min(
            1,
            isMove
              ? originalY - (ev.clientY - y) / r.height / fraction
              : (clickY - 0.5 / targetZoom) / fraction,
          ),
        );
      c.zoom = { ...initial, x: nx, y: ny };
      if (initial.keys)
        c.zoom.keys = initial.keys.map((k, i) =>
          (endpoint === "start" ? i === 0 || i === 3 : i === 1 || i === 2)
            ? { ...k, x: nx, y: ny }
            : k,
        );
      $(endpoint === "start" ? "motionFromX" : "motionToX").value = nx * 100;
      $(endpoint === "start" ? "motionFromY" : "motionToY").value = ny * 100;
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
  },
  true,
);
window.addEventListener(
  "keydown",
  (e) => {
    if (
      e.isComposing ||
      e.target.isContentEditable ||
      e.target.closest("textarea")
    )
      return;
    const dialog =
      e.target.closest("dialog") || document.querySelector("dialog[open]");
    if (e.key === "Enter" && e.target.id === "textStyleName") {
      e.preventDefault();
      e.stopImmediatePropagation();
      $("saveTextStyle").click();
      return;
    }
    if (e.key === "Enter" && e.target.closest("#motionControls")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      $("applyMotion").click();
      return;
    }
    if (e.key === "Enter" && dialog && dialog.id !== "appDialog") {
      const target = dialog.querySelector(
        '[value="save"], [value="apply"], #saveSettings, #doExport, #startRecording, button.primary:not([value="cancel"])',
      );
      if (target && !target.disabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.target.matches("input,select"))
          e.target.dispatchEvent(new Event("change", { bubbles: true }));
        target.click();
      }
      return;
    }
    if (
      dialog ||
      e.target.closest("input,select") ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    if (e.key.toLowerCase() === "n") {
      e.preventDefault();
      e.stopImmediatePropagation();
      fitTimeline = true;
      renderTimeline();
      $("timelineScroll").scrollLeft = 0;
    }
    if (e.key.toLowerCase() === "b" && selection.size) {
      const clips = selected(),
        start = Math.min(...clips.map((c) => c.start)),
        end = Math.max(...clips.map((c) => c.start + Timeline.duration(c)));
      e.preventDefault();
      e.stopImmediatePropagation();
      fitTimeline = false;
      scale = Math.min(
        640,
        Math.max(
          0.0001,
          ($("timelineScroll").clientWidth - 80) / (end - start),
        ),
      );
      renderTimeline();
      $("timelineScroll").scrollLeft = Math.max(0, start * scale - 35);
    }
  },
  true,
);
refreshTextStyles();
renderLibrary();
renderTimeline();
