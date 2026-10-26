/* Canvas preview and export rasterization share exactly the same annotation drawing. */
(function (root) {
  const buffers = new Map();
  function buffer(id, name, w, h) {
    const key = id + ":" + name;
    let cv = buffers.get(key);
    if (!cv) {
      cv = document.createElement("canvas");
      buffers.set(key, cv);
    }
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    return cv;
  }
  const scene = {
    release(ids) {
      for (const key of buffers.keys())
        if (!ids.has(key.split(":")[0])) buffers.delete(key);
    },
    wrap(ctx, text, width) {
      const lines = [];
      for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/(\s+)/)) {
          if (line && ctx.measureText(line + word).width > width) {
            lines.push(line.trimEnd());
            line = "";
          }
          for (const char of word) {
            if (line && ctx.measureText(line + char).width > width) {
              lines.push(line);
              line = "";
            }
            line += char;
          }
        }
        lines.push(line);
      }
      return lines;
    },
    effect(ctx, effect, W, H, id) {
      if (!effect || effect.type === "none") return;
      const copy = buffer(id, "under", W, H);
      copy.getContext("2d").clearRect(0, 0, W, H);
      copy.getContext("2d").drawImage(ctx.canvas, 0, 0);
      scene.draw(
        ctx,
        { id, in: 0, out: 1, effect },
        { kind: "image" },
        copy,
        0,
        W,
        H,
      );
    },
    annotation(ctx, a, t, W, H) {
      const x = (a.x / 100) * W,
        y = (a.y / 100) * H,
        s = H / 1080;
      ctx.save();
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.lineWidth * s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (a.type === "text") {
        ctx.font = `${a.size * s}px "${a.font.replace(/["\\]/g, "")}"`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const lines = scene.wrap(
            ctx,
            a.text,
            Math.max(1, ((a.width || 80) / 100) * W),
          ),
          lh = a.size * s * 1.25,
          width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
        if (a.backgroundEnabled) {
          ctx.fillStyle = a.background;
          ctx.fillRect(
            x - width / 2 - 12 * s,
            y - (lines.length * lh) / 2 - 8 * s,
            width + 24 * s,
            lines.length * lh + 16 * s,
          );
        }
        ctx.fillStyle = a.color;
        lines.forEach((line, i) => {
          const yLine = y + (i - (lines.length - 1) / 2) * lh;
          if (a.strokeWidth) {
            ctx.strokeStyle = a.strokeColor || "#000000";
            ctx.lineWidth = a.strokeWidth * s;
            ctx.strokeText(line, x, yLine);
          }
          ctx.fillText(line, x, yLine);
        });
      } else if (a.type === "arrow") {
        const r = (a.angle * Math.PI) / 180,
          len = (a.length / 100) * W,
          ex = x + Math.cos(r) * len,
          ey = y + Math.sin(r) * len,
          head = Math.max(18 * s, ctx.lineWidth * 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(
          ex - head * Math.cos(r - 0.5),
          ey - head * Math.sin(r - 0.5),
        );
        ctx.lineTo(ex, ey);
        ctx.lineTo(
          ex - head * Math.cos(r + 0.5),
          ey - head * Math.sin(r + 0.5),
        );
        ctx.stroke();
      } else {
        const f = a.animate ? Math.max(0, Math.min(1, t / a.animate)) : 1;
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          ((a.length / 100) * H) / 2,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * f,
        );
        ctx.stroke();
      }
      ctx.restore();
    },
    draw(ctx, c, m, source, t, W, H) {
      if (m.kind === "annotation") {
        const l = c.layout || { x: 0, y: 0, width: 100, height: 100 };
        ctx.save();
        ctx.translate((l.x / 100) * W, (l.y / 100) * H);
        ctx.scale(l.width / 100, l.height / 100);
        scene.annotation(ctx, c.annotation, t, W, H);
        ctx.restore();
        return;
      }
      const l = c.layout || { x: 0, y: 0, width: 100, height: 100 },
        rw = Math.max(2, Math.round((W * l.width) / 100)),
        rh = Math.max(2, Math.round((H * l.height) / 100));
      const layer = buffer(c.id, "layer", rw, rh);
      const p = layer.getContext("2d");
      // Letterboxing belongs to the project background, not this source layer.
      // Keep unused space transparent so lower tracks remain visible.
      p.clearRect(0, 0, rw, rh);
      const sw = source.videoWidth || source.naturalWidth || source.width || 1,
        sh = source.videoHeight || source.naturalHeight || source.height || 1,
        k = Math.min(rw / sw, rh / sh);
      if (c.backgroundBlur) {
        const background = buffer(c.id, "background", W, H),
          b = background.getContext("2d"),
          sigma = Math.max(1, (30 * H) / 1080),
          margin = Math.ceil(3 * sigma),
          cover = Math.max((W + 2 * margin) / sw, (H + 2 * margin) / sh);
        b.clearRect(0, 0, W, H);
        b.save();
        b.filter = `blur(${sigma}px)`;
        b.drawImage(
          source,
          (W - sw * cover) / 2,
          (H - sh * cover) / 2,
          sw * cover,
          sh * cover,
        );
        b.restore();
        ctx.drawImage(background, 0, 0);
      }
      if (l.content) {
        const b = l.content;
        p.drawImage(
          source,
          (b.x / 100) * rw,
          (b.y / 100) * rh,
          (b.width / 100) * rw,
          (b.height / 100) * rh,
        );
      } else
        p.drawImage(
          source,
          (rw - sw * k) / 2,
          (rh - sh * k) / 2,
          sw * k,
          sh * k,
        );
      const z = c.zoom || { from: 1, to: 1, x: 0.5, y: 0.5 },
        v = Math.max(0, Math.min(1, (t - c.in) / (c.out - c.in))),
        frame = root.Timeline?.zoomAt(c, t) || {
          scale: z.from + (z.to - z.from) * v,
          x: z.x,
          y: z.y,
        },
        zoom = frame.scale;
      if (zoom !== 1) {
        const cp = buffer(c.id, "zoom", rw, rh);
        cp.getContext("2d").clearRect(0, 0, rw, rh);
        cp.getContext("2d").drawImage(layer, 0, 0);
        p.clearRect(0, 0, rw, rh);
        p.drawImage(
          cp,
          (rw - rw / zoom) * frame.x,
          (rh - rh / zoom) * frame.y,
          rw / zoom,
          rh / zoom,
          0,
          0,
          rw,
          rh,
        );
      }
      const e = c.effect;
      if (e && e.type !== "none") {
        const x = Math.round((e.x / 100) * rw),
          y = Math.round((e.y / 100) * rh),
          w = Math.max(1, Math.round((e.width / 100) * rw)),
          h = Math.max(1, Math.round((e.height / 100) * rh)),
          cp = buffer(
            c.id,
            "effect",
            e.type === "blur"
              ? rw
              : Math.max(
                  1,
                  Math.round(w / Math.max(2, (e.strength * rh) / 1080)),
                ),
            e.type === "blur"
              ? rh
              : Math.max(
                  1,
                  Math.round(h / Math.max(2, (e.strength * rh) / 1080)),
                ),
          );
        if (e.type === "blur") {
          cp.getContext("2d").clearRect(0, 0, rw, rh);
          cp.getContext("2d").drawImage(layer, 0, 0);
          p.save();
          p.beginPath();
          if (e.shape === "circle")
            p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          else p.rect(x, y, w, h);
          p.clip();
          p.filter = `blur(${(e.strength * rh) / 1080}px)`;
          p.drawImage(cp, 0, 0);
          p.restore();
        } else {
          cp.getContext("2d").clearRect(0, 0, cp.width, cp.height);
          cp.getContext("2d").drawImage(
            layer,
            x,
            y,
            w,
            h,
            0,
            0,
            cp.width,
            cp.height,
          );
          p.save();
          if (e.shape === "circle") {
            p.beginPath();
            p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
            p.clip();
          }
          p.imageSmoothingEnabled = false;
          p.drawImage(cp, 0, 0, cp.width, cp.height, x, y, w, h);
          p.restore();
        }
      }
      ctx.drawImage(layer, (l.x / 100) * W, (l.y / 100) * H, rw, rh);
    },
  };
  root.Scene = scene;
})(globalThis);
