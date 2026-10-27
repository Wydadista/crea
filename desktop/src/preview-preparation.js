(function (root) {
  "use strict";
  class PreparationBatch {
    constructor(paint, complete) {
      this.jobs = new Map();
      this.paint = paint;
      this.complete = complete;
      this.sealed = false;
      this.finished = false;
    }
    track(key, promise) {
      if (this.finished || this.jobs.has(key) || this.sealed) return promise;
      const job = { progress: 0, done: false, failed: false };
      this.jobs.set(key, job);
      Promise.resolve(promise).then(
        () => this.settle(job, false),
        () => this.settle(job, true),
      );
      this.update();
      return promise;
    }
    report(key, percent, phase) {
      const job = this.jobs.get(key);
      if (!job || job.done || this.finished) return;
      job.progress = Math.max(job.progress, Math.min(99, Math.max(0, percent)));
      this.update(phase);
    }
    settle(job, failed) {
      job.done = true;
      job.failed = failed;
      job.progress = 100;
      this.update();
    }
    seal() {
      this.sealed = true;
      this.update();
    }
    update(phase) {
      if (this.finished) return;
      const jobs = [...this.jobs.values()];
      const done = jobs.filter((j) => j.done).length;
      const all = this.sealed && done === jobs.length;
      const percent = all
        ? 100
        : this.sealed && jobs.length
          ? Math.min(
              99,
              Math.floor(
                jobs.reduce((s, j) => s + j.progress, 0) / jobs.length,
              ),
            )
          : 0;
      const state = {
        percent,
        done,
        total: jobs.length,
        failed: jobs.filter((j) => j.failed).length,
        phase,
      };
      this.paint(state);
      if (all) {
        this.finished = true;
        this.complete(state);
      }
    }
  }
  root.PreparationBatch = PreparationBatch;
  if (typeof module !== "undefined") module.exports = PreparationBatch;
})(globalThis);
