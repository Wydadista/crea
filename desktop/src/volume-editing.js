"use strict";
// Showing the control is UI state. Only dragging it changes project audio gain.
(() => {
  const visible = new Set(),
    max = Timeline.MAX_VOLUME,
    button = $("editClipVolume"),
    menuButton = $("contextMenu").querySelector('[data-action="edit-volume"]');
  let controls = [];
  const hasAudio = (c) => !!mediaOf(c)?.hasAudio && !c.audioDetached;
  const targets = () => selected().filter((c) => !c.parentId && hasAudio(c));
  const editing = (clips) =>
    clips.length && clips.every((c) => visible.has(c.id));
  function syncButtons() {
    const clips = targets(),
      label = editing(clips) ? "Nascondi modifica volume" : "Modifica volume";
    for (const b of [button, menuButton]) {
      b.textContent = label;
      b.disabled = !clips.length;
      b.setAttribute("aria-pressed", String(!!editing(clips)));
    }
  }
  function toggle() {
    const clips = targets(),
      hide = editing(clips);
    for (const c of clips) hide ? visible.delete(c.id) : visible.add(c.id);
    renderTimeline();
    syncButtons();
  }
  button.onclick = toggle;
  menuButton.onclick = () => {
    $("contextMenu").hidden = true;
    toggle();
  };
  const previousContext = showContext;
  showContext = (x, y) => {
    previousContext(x, y);
    syncButtons();
  };
  const previousProperties = properties;
  properties = () => {
    previousProperties();
    syncButtons();
  };

  function repaint() {
    for (const control of controls) {
      control.paint();
      control.node.querySelector(".waveform")?.remove();
      drawWave(control.node, control.block);
    }
    properties();
  }
  function commit(before, cancelled = false) {
    if (cancelled) project = JSON.parse(before);
    else if (JSON.stringify(project) !== before) {
      history.push(before);
      if (history.length > 80) history.shift();
      future = [];
    }
    changed();
  }
  const previousTimeline = renderTimeline;
  renderTimeline = () => {
    previousTimeline();
    controls = [];
    const blocks = new Map(
      Timeline.groups(project.clips).map((b) => [b.members[0].id, b]),
    );
    for (const node of document.querySelectorAll(".clip[data-id]")) {
      const block = blocks.get(node.dataset.id);
      if (!block?.members.some((c) => hasAudio(c) && visible.has(c.id)))
        continue;
      const ids = new Set(
          Timeline.linkedIds(
            project.clips,
            block.members.map((c) => c.id),
          ),
        ),
        clips = project.clips.filter((c) => ids.has(c.id) && hasAudio(c));
      if (!clips.length) continue;
      const area = el("div", "clip-volume-control"),
        line = el("button", "clip-volume-line"),
        label = el("span", "clip-volume-label");
      line.type = "button";
      line.setAttribute("role", "slider");
      line.setAttribute("aria-label", "Volume della clip");
      line.setAttribute("aria-orientation", "vertical");
      line.setAttribute("aria-valuemin", "0");
      line.setAttribute("aria-valuemax", String(max * 100));
      line.append(label);
      area.append(line);
      node.append(area);
      const paint = () => {
        const c = block.members.find((c) => hasAudio(c)) || clips[0],
          percent = Math.round(c.volume * 100),
          mixed = clips.some(
            (other) => Math.abs(other.volume - c.volume) > 1e-8,
          );
        line.style.top = (1 - c.volume / max) * 100 + "%";
        line.setAttribute("aria-valuenow", String(percent));
        line.title = `${percent}%${mixed ? " · Volumi diversi" : ""} · trascina per modificare`;
        label.textContent = percent + "%" + (mixed ? " · misto" : "");
      };
      const choose = () => {
        pause();
        selection = new Set(clips.map((c) => c.id));
        previewFocus = clips[0].id;
      };
      const set = (value) => {
        const gain = Math.round(Math.max(0, Math.min(max, value)) * 100) / 100;
        for (const c of clips) {
          c.volume = gain;
          // Joined segments hidden by an outer trim must keep the chosen gain.
          for (const saved of c.joinedSegments || [])
            if (hasAudio(saved)) saved.volume = gain;
        }
        repaint();
      };
      line.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        choose();
        const before = JSON.stringify(project),
          y = e.clientY,
          original = (block.members.find((c) => hasAudio(c)) || clips[0])
            .volume,
          height = Math.max(1, area.getBoundingClientRect().height);
        const move = (ev) => set(original + ((y - ev.clientY) * max) / height);
        captureMove(e, move, (ev) => {
          if (ev.type !== "pointercancel") move(ev);
          commit(before, ev.type === "pointercancel");
        });
      };
      line.onkeydown = (e) => {
        const current = (block.members.find((c) => hasAudio(c)) || clips[0])
            .volume,
          step = e.shiftKey ? 0.1 : 0.01,
          value =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? max
                : ["ArrowUp", "ArrowRight"].includes(e.key)
                  ? current + step
                  : ["ArrowDown", "ArrowLeft"].includes(e.key)
                    ? current - step
                    : null;
        if (value === null) return;
        e.preventDefault();
        e.stopPropagation();
        choose();
        const before = JSON.stringify(project);
        set(value);
        commit(before);
      };
      controls.push({ node, block, paint });
      paint();
    }
  };
  properties();
  renderTimeline();
})();
