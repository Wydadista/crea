let canvas,
  context,
  writer,
  lastStamp = 0,
  lastWall = 0,
  period = 0,
  tail = Promise.resolve();
function emit(timestamp, duration) {
  lastStamp = Math.max(timestamp, lastStamp + 1);
  lastWall = performance.now();
  const output = new VideoFrame(canvas, {
    timestamp: Math.round(lastStamp),
    duration: Math.max(1, Math.round(duration || period)),
    alpha: "discard",
  });
  const next = tail
    .then(() => writer.write(output))
    .finally(() => output.close());
  tail = next.catch(() => {});
  return next;
}
onmessage = async ({ data }) => {
  if (data.flush) {
    if (canvas && writer)
      await emit(lastStamp + (performance.now() - lastWall) * 1000, period);
    postMessage({ flushed: data.flush });
    return;
  }
  if (!data.readable) return;
  const reader = data.readable.getReader();
  writer = data.writable.getWriter();
  period = 1e6 / data.fps;
  canvas = new OffscreenCanvas(data.width, data.height);
  context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  let ready = false;
  try {
    while (true) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      try {
        context.drawImage(frame, 0, 0, canvas.width, canvas.height);
        await emit(frame.timestamp, frame.duration || period);
        if (!ready) {
          postMessage({ ready: true });
          ready = true;
        }
      } finally {
        frame.close();
      }
    }
  } catch (error) {
    postMessage({ error: error.message });
  }
};
