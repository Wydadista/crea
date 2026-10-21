/* One native seek in flight, with a single replaceable destination. */
(function (root) {
  class LatestVideoSeek {
    constructor(video, onFrame, clock = root, beforeSeek = () => {}) {
      this.video = video;
      this.onFrame = onFrame;
      this.clock = clock;
      this.beforeSeek = beforeSeek;
      this.destination = null;
      this.tolerance = 0.002;
      this.frame = null;
      this.disposed = false;
      this.metadata = () => this.schedule();
      this.ready = () => {
        if (this.disposed) return;
        // Publish the decoded frame before scheduling the next destination.
        if (!video.seeking && video.readyState >= 2) onFrame();
        this.schedule();
      };
      video.addEventListener("loadedmetadata", this.metadata);
      video.addEventListener("loadeddata", this.ready);
      video.addEventListener("seeked", this.ready);
    }
    get target() {
      if (this.destination === null) return null;
      const end = Number.isFinite(this.video.duration)
        ? Math.max(0, this.video.duration - 0.0001)
        : Infinity;
      return Math.max(0, Math.min(this.destination, end));
    }
    get atTarget() {
      return (
        this.target !== null &&
        !this.video.seeking &&
        this.video.readyState >= 2 &&
        Math.abs(this.video.currentTime - this.target) <= this.tolerance
      );
    }
    request(at, tolerance = 0.002) {
      if (this.disposed || !Number.isFinite(at)) return;
      this.destination = at;
      this.tolerance = tolerance;
      this.schedule();
    }
    schedule() {
      if (
        this.disposed ||
        this.frame !== null ||
        this.target === null ||
        this.video.seeking ||
        this.video.readyState < 1 ||
        this.atTarget
      )
        return;
      this.frame = this.clock.requestAnimationFrame(() => {
        this.frame = null;
        if (
          this.disposed ||
          this.video.seeking ||
          this.target === null ||
          this.atTarget
        )
          return;
        try {
          if (this.video.readyState >= 2) this.beforeSeek();
          this.video.currentTime = this.target;
        } catch {}
      });
    }
    dispose() {
      this.disposed = true;
      if (this.frame !== null) this.clock.cancelAnimationFrame(this.frame);
      this.video.removeEventListener("loadedmetadata", this.metadata);
      this.video.removeEventListener("loadeddata", this.ready);
      this.video.removeEventListener("seeked", this.ready);
    }
  }
  root.LatestVideoSeek = LatestVideoSeek;
  if (typeof module !== "undefined") module.exports = LatestVideoSeek;
})(typeof window !== "undefined" ? window : globalThis);
