"use strict";
(() => {
  // Reusable stingers keep their independent video/audio lanes and tail.
  const rail = el("button", "", "▸");
  rail.id = "railTransitions";
  rail.append(el("span", "", "Transizioni"));
  $("railRecord").before(rail);
  const pane = el("div");
  pane.id = "transitionsPanel";
  pane.hidden = true;
  pane.style.setProperty("--element-columns", elementColumns);
  pane.innerHTML =
    '<h2>Transizioni</h2><h3>I miei stacchetti</h3><button id="saveStinger" class="import">＋ Salva selezione come stacchetto</button><p class="hint">Video e musica restano separati. La coda audio si sovrappone alla notizia successiva.</p><div id="stingerList" class="annotation-tools"></div>';
  $("mediaPanel").before(pane);
  const previousPanel = libraryPanel;
  libraryPanel = function (elements) {
    previousPanel(elements);
    pane.hidden = true;
    rail.classList.remove("active");
  };
  rail.onclick = () => {
    libraryPanel(false);
    $("mediaPanel").hidden = true;
    pane.hidden = false;
    $("railMedia").classList.remove("active");
    rail.classList.add("active");
    refreshStingers();
  };

  const nameDialog = el("dialog");
  nameDialog.id = "studioNameDialog";
  nameDialog.innerHTML =
    '<form><h2></h2><label>Nome<input required maxlength="200" autocomplete="off"></label><p class="hint"></p><footer><button type="button" data-cancel>Annulla</button><button type="submit" class="primary">Salva</button></footer></form>';
  document.body.append(nameDialog);
  function askName(title, value = "", hint = "") {
    return new Promise((resolve) => {
      nameDialog.querySelector("h2").textContent = title;
      const field = nameDialog.querySelector("input");
      field.value = value;
      nameDialog.querySelector("p").textContent = hint;
      let result = null;
      nameDialog.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        if (!field.value.trim()) return;
        result = field.value.trim();
        nameDialog.close();
      };
      nameDialog.querySelector("[data-cancel]").onclick = () =>
        nameDialog.close();
      nameDialog.onclose = () => resolve(result);
      nameDialog.showModal();
      field.focus();
      field.select();
    });
  }
  let presets = [],
    draggedPreset = null,
    guide = null,
    inserting = false;
  async function refreshStingers() {
    presets = await studio.stingers();
    paintStingers();
  }
  function paintStingers() {
    const list = $("stingerList");
    list.replaceChildren();
    if (!presets.length)
      list.append(
        el(
          "p",
          "hint",
          "Seleziona il tuo video e la musica, poi salvali qui. Li ritroverai anche nei nuovi progetti.",
        ),
      );
    for (const preset of presets) {
      const card = el("div", "stinger-card element-tile");
      card.dataset.stingerId = preset.id;
      if (preset.preview) {
        const img = el("img", "stinger-thumb");
        img.alt = preset.name;
        const poster = el("div", "element-preview");
        poster.append(img);
        card.append(poster);
        queueMicrotask(() =>
          thumbnail(preset.preview, preset.previewAt || 0, img),
        );
      }
      card.append(el("strong", "element-label", preset.name));
      card.append(
        el(
          "small",
          "",
          preset.error ||
            `Video ${fmt(preset.duration)} · Audio/insieme ${fmt(preset.total)}`,
        ),
      );
      const actions = el("div", "stinger-actions"),
        add = el("button", "stinger-insert", "＋ Inserisci"),
        remove = el("button", "stinger-delete", "×");
      add.disabled = !!preset.error;
      add.title = "Inserisci al cursore, spostando le notizie successive";
      add.onclick = safe(() =>
        insertPreset(preset.id, time, Number($("activeTrack").value)),
      );
      remove.title = "Rimuovi dalla raccolta";
      remove.setAttribute("aria-label", "Rimuovi stacchetto " + preset.name);
      remove.onclick = safe(async () => {
        if (
          (await showAppDialog({
            title: "Rimuovere lo stacchetto dalla raccolta?",
            message: preset.name,
            buttons: ["Rimuovi", "Annulla"],
            defaultId: 1,
            cancelId: 1,
          })) !== 0
        )
          return;
        await studio.removeStinger(preset.id);
        await refreshStingers();
      });
      actions.append(add, remove);
      card.append(actions);
      card.draggable = !preset.error;
      card.ondragstart = (e) => {
        draggedPreset = preset.id;
        e.dataTransfer.setData("application/akhbar-stinger", preset.id);
        e.dataTransfer.effectAllowed = "copy";
      };
      card.ondragend = () => {
        draggedPreset = null;
        clearGuide();
      };
      list.append(card);
    }
  }
  $("saveStinger").onclick = safe(async () => {
    if (!selection.size)
      return toast(
        "Seleziona il video e l’audio dello stacchetto nella timeline",
      );
    const snapshot = clone(project),
      ids = [...selection];
    const name = await askName(
      "Salva come stacchetto",
      "Stacchetto",
      "Viene conservata una copia dei media, disponibile anche nei prossimi progetti.",
    );
    if (!name) return;
    const job = studio.saveStinger(snapshot, ids, name.slice(0, 120));
    const batch = beginPreviewPreparation("Salvataggio dello stacchetto");
    batch.track("save-stinger", job);
    await job;
    await refreshStingers();
  });
  async function insertPreset(id, at, track) {
    if (inserting) return;
    inserting = true;
    try {
      pause();
      const preset = await studio.loadStinger(id);
      const result = Timeline.insertStinger(project, preset, at, track, uid);
      checkpoint();
      project = result.project;
      selection = new Set(result.ids);
      previewFocus = result.ids[0];
      renderLibrary();
      for (const m of project.media) requestWave(m);
      changed();
      focusNode(result.ids[0]);
      toast(
        `Stacchetto inserito: la notizia successiva inizia dopo ${fmt(result.duration)}`,
      );
    } finally {
      inserting = false;
    }
  }
  function clearGuide() {
    guide?.remove();
    guide = null;
  }
  function dropPosition(e) {
    const row = e.target.closest(".track"),
      track = row
        ? Number(row.id.replace("track", ""))
        : Number($("activeTrack").value);
    let at = Math.max(
      0,
      (e.clientX - $("ruler").getBoundingClientRect().left) / scale,
    );
    const edges = [
      0,
      ...project.clips
        .filter((c) => c.track === track)
        .flatMap((c) => [c.start, c.start + Timeline.duration(c)]),
    ];
    const nearest = edges.sort(
      (a, b) => Math.abs(a - at) - Math.abs(b - at),
    )[0];
    if (Math.abs(nearest - at) * scale < 20) at = nearest;
    return { at, track };
  }
  document.addEventListener(
    "dragover",
    (e) => {
      if (
        !e.dataTransfer.types.includes("application/akhbar-stinger") ||
        !e.target.closest(".timeline-panel")
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.dataTransfer.dropEffect = "copy";
      const { at } = dropPosition(e);
      if (!guide) {
        guide = el("div", "stinger-insertion-guide");
        document.body.append(guide);
      }
      const r = $("timelineScroll").getBoundingClientRect();
      Object.assign(guide.style, {
        left: $("ruler").getBoundingClientRect().left + at * scale + "px",
        top: r.top + "px",
        height: r.height + "px",
      });
    },
    true,
  );
  document.addEventListener(
    "drop",
    (e) => {
      const id =
        e.dataTransfer.getData("application/akhbar-stinger") || draggedPreset;
      if (!id || !e.target.closest(".timeline-panel")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const { at, track } = dropPosition(e);
      clearGuide();
      draggedPreset = null;
      safe(() => insertPreset(id, at, track))();
    },
    true,
  );

  // Anchors use source time, so moving/splitting/retiming keeps the exact content point.
  function clipAt(at) {
    const crossed = project.clips.filter(
      (c) =>
        !c.parentId && at >= c.start && at < c.start + Timeline.duration(c),
    );
    return (
      crossed.find((c) => c.id === previewFocus && selection.has(c.id)) ||
      crossed.find((c) => selection.has(c.id)) ||
      crossed.find((c) => c.track === Number($("activeTrack").value)) ||
      crossed.sort((a, b) => b.track - a.track)[0]
    );
  }
  const markerButton = el("button", "", "⚑ Segnalibro");
  markerButton.id = "addTimelineMarker";
  markerButton.title = "Aggiungi un segnalibro alla linea verde";
  document.querySelector(".timeline-toolbar").append(markerButton);
  markerButton.onclick = safe(async () => {
    const at = time,
      clip = clipAt(at);
    if (!clip)
      return toast(
        "Posiziona la linea verde su una clip per aggiungere il segnalibro",
      );
    const name = await askName(
      "Nuovo segnalibro",
      "",
      `Posizione: ${fmt(time)} · visibile soltanto nell’editor`,
    );
    if (!name) return;
    checkpoint();
    (project.markers ||= []).push(
      Timeline.anchorMarker({ id: uid(), name }, clip, at),
    );
    changed();
  });
  async function editMarker(marker) {
    const name = await askName(
      "Rinomina segnalibro",
      marker.name,
      "I segnalibri non compaiono nel video esportato.",
    );
    if (!name || name === marker.name) return;
    checkpoint();
    marker.name = name;
    changed();
  }
  const previousRuler = renderRuler;
  renderRuler = function () {
    previousRuler();
    for (const marker of project.markers || []) {
      if (!marker.clipAnchor) {
        const c = clipAt(marker.time);
        if (c) Timeline.anchorMarker(marker, c, marker.time);
      }
      const markerTime = Timeline.markerTime(project, marker);
      if (markerTime === null) continue; // Trimmed/deleted content stays hidden; undo can restore it.
      marker.time = markerTime;
      const flag = el("button", "timeline-marker", "⚑");
      flag.type = "button";
      flag.dataset.markerId = marker.id;
      flag.style.left = marker.time * scale + "px";
      flag.title = marker.name + " · " + fmt(marker.time);
      flag.setAttribute("aria-label", flag.title);
      flag.append(el("span", "", marker.name));
      $("ruler").append(flag);
      flag.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pause();
        const before = JSON.stringify(project),
          x = e.clientX,
          original = marker.time,
          scroll = $("timelineScroll").scrollLeft,
          dragScale = scale;
        let moved = false;
        const move = (ev) => {
          if (Math.abs(ev.clientX - x) > 3) moved = true;
          if (!moved) return;
          const c = Timeline.markerClip(project, marker);
          const at =
            original +
            (ev.clientX - x + $("timelineScroll").scrollLeft - scroll) /
              dragScale;
          if (c)
            Timeline.anchorMarker(
              marker,
              c,
              Math.max(
                c.start,
                Math.min(c.start + Timeline.duration(c) - 1e-6, at),
              ),
            );
          else marker.time = Math.max(0, Math.min(604800, at));
          flag.style.left = marker.time * scale + "px";
          flag.title = marker.name + " · " + fmt(marker.time);
        };
        captureMove(e, move, (ev) => {
          if (ev.type === "pointercancel") project = JSON.parse(before);
          else if (moved) {
            move(ev);
            history.push(before);
            future = [];
          } else seek(marker.time, true);
          changed();
        });
      };
      flag.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        safe(() => editMarker(marker))();
      };
      flag.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        safe(async () => {
          const choice = await showAppDialog({
            title: marker.name,
            message: "Segnalibro · " + fmt(marker.time),
            buttons: ["Rinomina", "Elimina segnalibro", "Annulla"],
            defaultId: 2,
            cancelId: 2,
          });
          if (choice === 0) await editMarker(marker);
          if (choice === 1) {
            checkpoint();
            project.markers = project.markers.filter((m) => m.id !== marker.id);
            changed();
          }
        })();
      };
    }
  };
  const previousTimeline = renderTimeline;
  renderTimeline = function () {
    previousTimeline();
    for (const node of document.querySelectorAll(".clip[data-id]")) {
      const c = project.clips.find((c) => c.id === node.dataset.id);
      if (!c?.stingerId) continue;
      node.classList.add("stinger-clip");
      const badge = node.querySelector(".link-badge");
      if (badge) {
        badge.textContent = "♫ " + (c.stingerName || "Stacchetto");
        badge.title = badge.textContent;
      }
    }
  };
  refreshStingers().catch((e) => toast("Stacchetti: " + e.message));
  renderTimeline();
})();
