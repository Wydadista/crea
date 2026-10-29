"use strict";
(() => {
  const max = Timeline.MAX_VOLUME;
  const menu = el("div");
  menu.id = "volumePointMenu";
  menu.hidden = true;
  document.body.append(menu);
  document.addEventListener("pointerdown", (e) => {
    if (!menu.contains(e.target)) menu.hidden = true;
  });
  let pinned = [];
  function pinButtons() {
    const viewport = $("timelineScroll"),
      view = viewport.getBoundingClientRect(),
      visibleRight = view.left + viewport.clientLeft + viewport.clientWidth;
    for (const { area, add } of pinned) {
      const r = area.getBoundingClientRect(),
        left = Math.max(r.left, view.left),
        right = Math.min(r.right, visibleRight);
      add.hidden = right - left < 20;
      add.style.right = "auto";
      add.style.left = Math.max(0, right - r.left - 21) + "px";
    }
  }
  $("timelineScroll").addEventListener("scroll", pinButtons, { passive: true });
  new ResizeObserver(pinButtons).observe($("timelineScroll"));
  const previousTimeline = renderTimeline;
  renderTimeline = function () {
    previousTimeline();
    pinned = [];
    const blocks = new Map(
      Timeline.groups(project.clips).map((b) => [b.members[0].id, b]),
    );
    for (const node of document.querySelectorAll(".clip[data-id]")) {
      const area = node.querySelector(".clip-volume-control"),
        block = blocks.get(node.dataset.id);
      if (!area || !block) continue;
      const ids = new Set(
        Timeline.linkedIds(
          project.clips,
          block.members.map((c) => c.id),
        ),
      );
      const clips = project.clips.filter(
        (c) => ids.has(c.id) && mediaOf(c)?.hasAudio && !c.audioDetached,
      );
      const ref =
        block.members.find((c) => mediaOf(c)?.hasAudio && !c.audioDetached) ||
        clips[0];
      if (!ref) continue;
      const line = area.querySelector(".clip-volume-line");
      const surface = el("div", "volume-point-surface");
      area.append(surface);
      const add = el("button", "volume-add-point", "＋");
      add.type = "button";
      add.title =
        "Aggiungi punto alla linea verde · Ctrl+clic sulla linea per scegliere il punto";
      add.setAttribute("aria-label", "Aggiungi punto volume");
      area.append(add);
      pinned.push({ area, add });
      const toTime = (source) =>
          ref.start + (source - ref.in) / (ref.speed || 1),
        toSource = (c, t) => c.in + (t - c.start) * (c.speed || 1);
      const master = () =>
        ref.volumePoints?.length
          ? ref.volumePoints.map((p) => ({
              time: toTime(p.time),
              value: p.value,
            }))
          : [
              {
                time: Math.min(...clips.map((c) => c.start)),
                value: ref.volume,
              },
              {
                time: Math.max(
                  ...clips.map((c) => c.start + Timeline.duration(c)),
                ),
                value: ref.volume,
              },
            ];
      const gain = (t) => Timeline.volumeAt(ref, toSource(ref, t));
      const choose = () => {
        pause();
        selection = new Set(clips.map((c) => c.id));
        previewFocus = ref.id;
      };
      const save = (points) => {
        points.sort((a, b) => a.time - b.time);
        for (const c of clips) {
          c.volumePoints = points.map((p) => ({
            time: toSource(c, p.time),
            value: p.value,
          }));
          for (const s of c.joinedSegments || [])
            s.volumePoints = clone(c.volumePoints);
        }
      };
      const commit = (before, cancelled = false) => {
        if (cancelled) project = JSON.parse(before);
        else if (JSON.stringify(project) !== before) {
          history.push(before);
          future = [];
        }
        changed();
      };
      const position = (e) => {
        const rect = area.getBoundingClientRect();
        return {
          time: Math.max(
            block.start,
            Math.min(
              block.end,
              block.start +
                ((e.clientX - rect.left) / Math.max(1, rect.width)) *
                  (block.end - block.start),
            ),
          ),
          value:
            Math.round(
              Math.max(
                0,
                Math.min(
                  max,
                  (1 - (e.clientY - rect.top) / Math.max(1, rect.height)) * max,
                ),
              ) * 100,
            ) / 100,
        };
      };
      function addPoint(point) {
        choose();
        const before = JSON.stringify(project),
          points = master();
        const match = points.find((p) => Math.abs(p.time - point.time) < 0.005);
        if (match) Object.assign(match, point);
        else points.push(point);
        if (points.length > 1000)
          return toast("Limite di 1000 punti volume raggiunto");
        save(points);
        commit(before);
      }
      add.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      add.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const at =
          time >= block.start && time <= block.end
            ? time
            : (block.start + block.end) / 2;
        addPoint({ time: at, value: gain(at) });
      };
      area.addEventListener(
        "pointerdown",
        (e) => {
          if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            addPoint(position(e));
          }
        },
        true,
      );
      surface.onpointerdown = (e) => {
        e.stopPropagation();
      };
      surface.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addPoint(position(e));
      };
      function showMenu(e, label, action) {
        e.preventDefault();
        e.stopPropagation();
        menu.replaceChildren();
        const b = el("button", "", label);
        b.onclick = () => {
          menu.hidden = true;
          choose();
          const before = JSON.stringify(project);
          action();
          commit(before);
        };
        menu.append(b);
        menu.hidden = false;
        menu.style.left = Math.min(e.clientX, innerWidth - 240) + "px";
        menu.style.top = Math.min(e.clientY, innerHeight - 50) + "px";
      }
      surface.oncontextmenu = (e) =>
        showMenu(e, "Rimuovi tutti i punti volume", () => {
          for (const c of clips) {
            delete c.volumePoints;
            for (const s of c.joinedSegments || []) delete s.volumePoints;
          }
        });
      function paint() {
        const automated = !!ref.volumePoints?.length;
        line.hidden = automated;
        surface.style.pointerEvents = automated ? "auto" : "none";
        surface.replaceChildren();
        if (!automated) return;
        const points = master(),
          plot = [
            { time: block.start, value: gain(block.start) },
            ...points.filter((p) => p.time > block.start && p.time < block.end),
            { time: block.end, value: gain(block.end) },
          ];
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");
        const poly = document.createElementNS(svg.namespaceURI, "polyline");
        poly.setAttribute(
          "points",
          plot
            .map(
              (p) =>
                `${((p.time - block.start) / (block.end - block.start)) * 100},${(1 - p.value / max) * 100}`,
            )
            .join(" "),
        );
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#FFC82E");
        poly.setAttribute("stroke-width", "2");
        poly.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(poly);
        surface.append(svg);
        for (const point of points.filter(
          (p) => p.time >= block.start - 1e-8 && p.time <= block.end + 1e-8,
        )) {
          const dot = el("button", "volume-point");
          dot.type = "button";
          dot.style.left =
            ((point.time - block.start) / (block.end - block.start)) * 100 +
            "%";
          dot.style.top = (1 - point.value / max) * 100 + "%";
          dot.title = `${Math.round(point.value * 100)}% · ${fmt(point.time)} · trascina o usa il tasto destro`;
          dot.setAttribute("aria-label", dot.title);
          surface.append(dot);
          const remove = () => {
            const remaining = master().filter(
              (p) => Math.abs(p.time - point.time) > 0.001,
            );
            save(remaining);
          };
          dot.oncontextmenu = (e) =>
            showMenu(e, "Elimina punto volume", remove);
          dot.onpointerdown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            choose();
            const before = JSON.stringify(project),
              others = master().filter(
                (p) => Math.abs(p.time - point.time) > 0.001,
              );
            const move = (ev) => {
              const next = position(ev),
                all = [
                  ...others.filter((p) => Math.abs(p.time - next.time) > 0.005),
                  next,
                ];
              save(all);
              paint();
              node.querySelector(".waveform")?.remove();
              drawWave(node, block);
            };
            captureMove(e, move, (ev) => {
              if (ev.type !== "pointercancel") move(ev);
              commit(before, ev.type === "pointercancel");
            });
          };
          dot.onkeydown = (e) => {
            if (
              ![
                "Delete",
                "Backspace",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
              ].includes(e.key)
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            choose();
            const before = JSON.stringify(project);
            if (["Delete", "Backspace"].includes(e.key)) remove();
            else {
              const next = { ...point };
              if (e.key === "ArrowUp")
                next.value = Math.min(max, next.value + 0.01);
              if (e.key === "ArrowDown")
                next.value = Math.max(0, next.value - 0.01);
              if (e.key === "ArrowLeft")
                next.time = Math.max(block.start, next.time - 0.05);
              if (e.key === "ArrowRight")
                next.time = Math.min(block.end, next.time + 0.05);
              save([
                ...master().filter(
                  (p) =>
                    Math.abs(p.time - point.time) > 0.001 &&
                    Math.abs(p.time - next.time) > 0.005,
                ),
                next,
              ]);
            }
            commit(before);
          };
        }
      }
      paint();
    }
    pinButtons();
  };
  renderTimeline();
})();
