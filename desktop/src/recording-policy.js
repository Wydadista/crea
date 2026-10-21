/* Recording choices shared by the UI, fallback encoder and diagnostics. */
(function (root) {
  const policy = {
    size(width, height, maxHeight) {
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 1 ||
        height < 1
      )
        throw Error("Dimensioni della sorgente non disponibili");
      const factor = Math.min(1, maxHeight / height);
      return {
        width: Math.max(2, Math.round((width * factor) / 2) * 2),
        height: Math.max(2, Math.round((height * factor) / 2) * 2),
      };
    },
    bitrate(settings, width, height) {
      const pixels = (width * height) / (1920 * 1080),
        q = Math.max(1, Math.min(100, settings.quality)) / 100;
      const value =
        settings.profile === "screen-text"
          ? pixels *
            (3000000 + 13000000 * q * q) *
            Math.max(0.5, Math.min(2, Math.pow(settings.fps / 30, 0.5)))
          : 8000000 * pixels * (settings.fps / 30) * (0.2 + q * 1.2);
      return Math.round(Math.max(200000, Math.min(80000000, value)));
    },
    mimeCandidates(settings) {
      if (settings.audioOnly) return ["audio/webm;codecs=opus"];
      if (settings.format === "webm")
        return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"];
      return [
        "video/mp4;codecs=avc1.640034,mp4a.40.2",
        "video/mp4;codecs=avc1.640033,mp4a.40.2",
        "video/mp4;codecs=avc1.420033,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/webm;codecs=h264,opus",
        "video/webm;codecs=vp8,opus",
      ];
    },
    fallbackCrf(settings) {
      const legacy = { small: 30, balanced: 23, high: 18 };
      if (Object.hasOwn(legacy, settings.quality))
        return legacy[settings.quality];
      return Math.round(
        (settings.profile === "screen-text" ? 34 : 40) -
          settings.quality * (settings.profile === "screen-text" ? 0.22 : 0.26),
      );
    },
  };
  root.RecordingPolicy = policy;
  if (typeof module !== "undefined") module.exports = policy;
})(typeof window !== "undefined" ? window : globalThis);
