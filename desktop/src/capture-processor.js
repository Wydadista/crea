/* Scale raw capture frames off the UI thread, without decoding through an HTML video. */
async function createScaledCapture(track, size, fps) {
  if (
    typeof MediaStreamTrackProcessor === "undefined" ||
    typeof MediaStreamTrackGenerator === "undefined"
  )
    return null;
  const processor = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }),
    generator = new MediaStreamTrackGenerator({ kind: "video" }),
    worker = new Worker("capture-worker.js");
  let ready = false,
    closed = false;
  const pending = new Map();
  let request = 0;
  const close = () => {
    if (closed) return;
    closed = true;
    worker.terminate();
    generator.stop();
    for (const done of pending.values()) done();
    pending.clear();
  };
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Ridimensionamento non disponibile")),
        5000,
      );
      worker.onmessage = ({ data }) => {
        if (data.ready) {
          ready = true;
          clearTimeout(timeout);
          resolve();
        }
        if (data.error) {
          clearTimeout(timeout);
          if (!ready) reject(Error(data.error));
          else console.error("Capture worker:", data.error);
        }
        if (data.flushed) {
          pending.get(data.flushed)?.();
          pending.delete(data.flushed);
        }
      };
      worker.onerror = (event) => {
        clearTimeout(timeout);
        if (!ready) reject(Error(event.message));
      };
      worker.postMessage(
        {
          readable: processor.readable,
          writable: generator.writable,
          width: size.width,
          height: size.height,
          fps,
        },
        [processor.readable, generator.writable],
      );
    });
  } catch (error) {
    close();
    return null;
  }
  return {
    track: generator,
    close,
    flush: () =>
      new Promise((resolve) => {
        const id = ++request;
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve();
        }, 200);
        pending.set(id, done);
        worker.postMessage({ flush: id });
      }),
  };
}
