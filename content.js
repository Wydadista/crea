"use strict";
(() => {
  // One controller per document, in the isolated extension world.
  if (globalThis.__akhbarBlurInstalled) return;
  globalThis.__akhbarBlurInstalled = true;
  let host, shadow, plane, layer, toolbar, status, slider, output, selectButton;
  let selecting = false,
    strength = 16,
    gesture = null,
    frame = 0;
  const areas = [];
  const minSize = 12;
  const point = (e) => ({
    x: e.clientX + window.scrollX,
    y: e.clientY + window.scrollY,
  });
  const copyRect = (r) => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
  });

  function documentRect(area) {
    const a = area.anchor;
    if (!a || !a.element.isConnected) return copyRect(area.rect);
    const r = a.element.getBoundingClientRect();
    if (!r.width || !r.height) return copyRect(area.rect);
    return {
      x: r.left + window.scrollX + a.x * (a.scaled ? r.width : 1),
      y: r.top + window.scrollY + a.y * (a.scaled ? r.height : 1),
      width: a.width * (a.scaled ? r.width : 1),
      height: a.height * (a.scaled ? r.height : 1),
    };
  }
  function anchorArea(area) {
    // Hide only our overlay for synchronous hit testing; the browser never paints this state.
    host.setAttribute("data-hit-testing", "");
    const r = area.rect,
      cx = r.x - window.scrollX + r.width / 2,
      cy = r.y - window.scrollY + r.height / 2;
    let element = document.elementFromPoint(cx, cy);
    host.removeAttribute("data-hit-testing");
    area.anchor = null;
    while (
      element &&
      element !== document.body &&
      element !== document.documentElement
    ) {
      const b = element.getBoundingClientRect();
      if (
        b.width &&
        b.height &&
        b.left <= r.x - window.scrollX + 1 &&
        b.top <= r.y - window.scrollY + 1 &&
        b.right >= r.x - window.scrollX + r.width - 1 &&
        b.bottom >= r.y - window.scrollY + r.height - 1
      ) {
        const scaled = /^(IMG|VIDEO|CANVAS|IFRAME|SVG)$/.test(element.tagName);
        area.anchor = {
          element,
          scaled,
          x: (r.x - window.scrollX - b.left) / (scaled ? b.width : 1),
          y: (r.y - window.scrollY - b.top) / (scaled ? b.height : 1),
          width: r.width / (scaled ? b.width : 1),
          height: r.height / (scaled ? b.height : 1),
        };
        break;
      }
      element = element.parentElement;
    }
    watchAnchors();
  }
  const observer = new ResizeObserver(() => schedule());
  function watchAnchors() {
    observer.disconnect();
    for (const element of new Set(
      areas.map((a) => a.anchor?.element).filter(Boolean),
    ))
      if (element.isConnected) observer.observe(element);
  }
  function paint(area) {
    const r = gesture?.area === area ? area.rect : documentRect(area);
    // Last valid document position is the fallback if a page removes its anchor.
    area.rect = copyRect(r);
    const x = r.x - window.scrollX,
      y = r.y - window.scrollY;
    const visible =
      x + r.width > 0 &&
      y + r.height > 0 &&
      x < window.innerWidth &&
      y < window.innerHeight;
    area.node.hidden = !visible;
    Object.assign(area.node.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }
  function layout() {
    frame = 0;
    if (gesture) updateGesture(gesture.last);
    for (const area of areas) paint(area);
    if (gesture?.kind === "draw") paint(gesture.area);
  }
  function schedule() {
    if ((areas.length || gesture) && !frame)
      frame = requestAnimationFrame(layout);
  }
  function sync() {
    plane.hidden = !selecting;
    selectButton.setAttribute("aria-pressed", String(selecting));
    selectButton.textContent = selecting
      ? "Fine selezione"
      : "＋ Seleziona area";
    for (const area of areas) {
      area.node.classList.toggle("editing", selecting);
      area.node
        .querySelectorAll(".handle")
        .forEach((h) => (h.hidden = !selecting));
    }
    shadow.querySelector('[data-command="undo"]').disabled = !areas.length;
    shadow.querySelector('[data-command="clear"]').disabled = !areas.length;
    status.textContent = selecting
      ? `Trascina sulla pagina · Esc per finire · Aree: ${areas.length}`
      : `Navigazione libera · Aree sfocate: ${areas.length}`;
  }
  function cancelGesture() {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (g.kind === "draw") g.area.node.remove();
    else {
      g.area.rect = g.original;
      g.area.anchor = g.anchor;
      paint(g.area);
    }
    if (g.capture.hasPointerCapture(g.pointerId))
      g.capture.releasePointerCapture(g.pointerId);
  }
  function setSelecting(value) {
    cancelGesture();
    selecting = value;
    sync();
  }
  function createArea(rect) {
    const node = document.createElement("div");
    node.className = "area draft";
    node.style.setProperty("--blur", `${strength}px`);
    node.setAttribute("aria-label", "Area sfocata: trascina per spostarla");
    for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const h = document.createElement("button");
      h.type = "button";
      h.className = "handle";
      h.dataset.handle = direction;
      h.tabIndex = -1;
      h.setAttribute("aria-label", `Ridimensiona area (${direction})`);
      node.append(h);
    }
    layer.append(node);
    return { rect, node, anchor: null };
  }
  function updateGesture(e) {
    const g = gesture;
    if (!g) return;
    g.last = { clientX: e.clientX, clientY: e.clientY };
    const p = point(e),
      dx = p.x - g.origin.x,
      dy = p.y - g.origin.y,
      r = g.original;
    if (g.kind === "draw") {
      g.area.rect = {
        x: Math.max(0, Math.min(g.origin.x, p.x)),
        y: Math.max(0, Math.min(g.origin.y, p.y)),
        width: Math.abs(p.x - g.origin.x),
        height: Math.abs(p.y - g.origin.y),
      };
    } else if (g.kind === "move") {
      g.area.rect = {
        ...r,
        x: Math.max(0, r.x + dx),
        y: Math.max(0, r.y + dy),
      };
    } else {
      let left = r.x,
        top = r.y,
        right = r.x + r.width,
        bottom = r.y + r.height;
      if (g.handle.includes("w"))
        left = Math.max(0, Math.min(right - minSize, left + dx));
      if (g.handle.includes("e")) right = Math.max(left + minSize, right + dx);
      if (g.handle.includes("n"))
        top = Math.max(0, Math.min(bottom - minSize, top + dy));
      if (g.handle.includes("s")) bottom = Math.max(top + minSize, bottom + dy);
      g.area.rect = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    }
  }
  function begin(e) {
    if (
      !selecting ||
      e.button !== 0 ||
      !e.isPrimary ||
      toolbar.contains(e.target)
    )
      return;
    const node = e.target.closest(".area");
    if (e.target !== plane && !node) return;
    e.preventDefault();
    e.stopPropagation();
    cancelGesture();
    const origin = point(e),
      area = node
        ? areas.find((a) => a.node === node)
        : createArea({ ...origin, width: 0, height: 0 }),
      handle = e.target.dataset.handle || "",
      original = node ? documentRect(area) : { ...origin, width: 0, height: 0 };
    area.rect = copyRect(original);
    gesture = {
      area,
      original,
      anchor: area.anchor,
      origin,
      handle,
      kind: !node ? "draw" : handle ? "resize" : "move",
      capture: node || plane,
      pointerId: e.pointerId,
      last: { clientX: e.clientX, clientY: e.clientY },
    };
    gesture.capture.setPointerCapture(e.pointerId);
    paint(area);
  }
  function finish(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== "pointerup") {
      cancelGesture();
      return;
    }
    updateGesture(e);
    const g = gesture;
    gesture = null;
    if (g.capture.hasPointerCapture(g.pointerId))
      g.capture.releasePointerCapture(g.pointerId);
    if (g.kind === "draw") {
      if (g.area.rect.width < minSize || g.area.rect.height < minSize) {
        g.area.node.remove();
        return;
      }
      areas.push(g.area);
      g.area.node.classList.remove("draft");
    }
    anchorArea(g.area);
    paint(g.area);
    sync();
  }
  function mount(html, css) {
    host = document.createElement("akhbar-blur-ui");
    // Shadow DOM isolates the controls from article CSS.
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    shadow.append(style);
    const template = document.createElement("template");
    template.innerHTML = html;
    shadow.append(template.content.cloneNode(true));
    document.documentElement.append(host);
    plane = shadow.querySelector(".selection-plane");
    layer = shadow.querySelector(".areas");
    toolbar = shadow.querySelector(".toolbar");
    status = shadow.querySelector('[role="status"]');
    slider = shadow.querySelector("input");
    output = shadow.querySelector("output");
    selectButton = shadow.querySelector('[data-command="select"]');
    shadow.addEventListener("pointerdown", begin);
    shadow.addEventListener("pointermove", (e) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      updateGesture(e);
      schedule();
    });
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
      shadow.addEventListener(event, finish);
    shadow.addEventListener("click", (e) => {
      const command = e.target.closest("[data-command]")?.dataset.command;
      if (!command) return;
      if (command === "select") setSelecting(!selecting);
      if (command === "hide") {
        setSelecting(false);
        toolbar.hidden = true;
      }
      if (command === "undo" || command === "clear") {
        cancelGesture();
        const removed =
          command === "clear" ? areas.splice(0) : areas.splice(-1);
        for (const a of removed) a.node.remove();
        watchAnchors();
        sync();
      }
    });
    slider.addEventListener("input", () => {
      strength = Number(slider.value);
      output.textContent = `${strength} px`;
      for (const a of areas)
        a.node.style.setProperty("--blur", `${strength}px`);
      if (gesture)
        gesture.area.node.style.setProperty("--blur", `${strength}px`);
    });
    // Prevent article shortcuts reacting to clicks/keys in the extension panel.
    for (const event of [
      "pointerdown",
      "pointerup",
      "click",
      "dblclick",
      "keydown",
      "keyup",
    ])
      host.addEventListener(event, (e) => e.stopPropagation());
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || (!selecting && !gesture)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setSelecting(false);
      },
      true,
    );
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("load", schedule, true);
  }
  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== "akhbar-blur:activate") return;
    if (!host) mount(message.html, message.css);
    // A page navigation clears everything; repeated activation keeps existing areas.
    if (!host.isConnected) document.documentElement.append(host);
    toolbar.hidden = false;
    setSelecting(true);
    schedule();
    return Promise.resolve({ ready: true });
  });
})();
