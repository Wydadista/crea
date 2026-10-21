/* Audio is scheduled in samples, independently of GUI frames and video decoders.
   Shared 30-second pages keep RAM bounded even for long recordings and many cuts. */
(function (root) {
  class AudioTransport {
    constructor(load, context) {
      this.load = load;
      this.context = context;
      this.buffers = new Map();
      this.nodes = new Set();
      this.generation = 0;
      this.running = false;
      this.pageSeconds = 30;
    }
    init() {
      this.context ||= new AudioContext({ latencyHint: "interactive" });
      if (!this.analyser) {
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.connect(this.context.destination);
      }
      return this.context;
    }
    key(c, m, page) {
      return JSON.stringify([
        m.id,
        m.path,
        c.speed || 1,
        !!c.mono,
        c.voice || null,
        page,
      ]);
    }
    buffer(c, m, page) {
      const key = this.key(c, m, page);
      this.init();
      if (!this.buffers.has(key)) {
        const promise = Promise.resolve(this.load(c, m, page))
          .then((bytes) =>
            this.context.decodeAudioData(
              bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ),
            ),
          )
          .catch((e) => {
            this.buffers.delete(key);
            throw e;
          });
        this.buffers.set(key, promise);
      }
      const promise = this.buffers.get(key);
      this.buffers.delete(key);
      this.buffers.set(key, promise);
      // Scheduled AudioBufferSource nodes retain their own buffer until completion.
      while (this.buffers.size > 12)
        this.buffers.delete(this.buffers.keys().next().value);
      return promise;
    }
    segments(project, position) {
      const out = [];
      for (const c of project.clips) {
        const m = project.media.find((m) => m.id === c.mediaId),
          end = c.start + Timeline.duration(c);
        if (
          !m?.hasAudio ||
          c.muted ||
          project.trackMuted?.[c.track] ||
          !c.volume ||
          end <= position ||
          c.start > position + 3
        )
          continue;
        const base = c.in / (c.speed || 1),
          from = Math.max(position, c.start);
        const first = Math.floor((base + from - c.start) / this.pageSeconds),
          last = Math.floor(
            (base + Math.min(end, position + 3) - c.start - 1e-8) /
              this.pageSeconds,
          );
        for (let page = first; page <= last; page++) {
          const start = Math.max(
              from,
              c.start + page * this.pageSeconds - base,
            ),
            stop = Math.min(
              end,
              c.start + (page + 1) * this.pageSeconds - base,
            );
          if (stop > start)
            out.push({
              c,
              m,
              page,
              start,
              stop,
              offset: base + start - c.start - page * this.pageSeconds,
            });
        }
      }
      return out;
    }
    prepare(project, position = 0) {
      return Promise.all(
        this.segments(project, position).map((s) =>
          this.buffer(s.c, s.m, s.page),
        ),
      );
    }
    time() {
      return this.running
        ? Math.min(
            this.end,
            this.position + Math.max(0, this.context.currentTime - this.anchor),
          )
        : this.position;
    }
    stop() {
      this.generation++;
      if (this.running) this.position = this.time();
      this.running = false;
      clearInterval(this.timer);
      for (const node of this.nodes) {
        try {
          node.stop();
        } catch {}
        node.disconnect();
      }
      this.nodes.clear();
    }
    async start(project, position, ready = async () => {}) {
      this.stop();
      const token = this.generation;
      this.init();
      await this.context.resume();
      // Cold seeks and preparation happen before the clock starts, never inside a cut.
      const segments = this.segments(project, position);
      const audio = await Promise.all(
        segments.map((s) => this.buffer(s.c, s.m, s.page)),
      );
      await ready();
      if (token !== this.generation) return false;
      this.position = position;
      this.end = Timeline.total(project.clips);
      this.anchor = this.context.currentTime + 0.035;
      this.running = true;
      this.scheduled = [];
      const queued = new Set();
      const scheduleOne = (s, buffer) => {
        if (token !== this.generation || !this.running) return;
        const node = this.context.createBufferSource(),
          gain = this.context.createGain();
        node.buffer = buffer;
        gain.gain.value = s.c.volume;
        node.connect(gain);
        gain.connect(this.analyser);
        const when = this.anchor + s.start - position;
        // If the machine stalls past the lookahead, stop at this boundary rather than
        // discard the beginning of a short cut. The UI can resume once ready.
        if (when < this.context.currentTime - 0.02) {
          node.disconnect();
          gain.disconnect();
          this.stop();
          this.position = s.start;
          this.onbuffering?.(s.start);
          return;
        }
        // Floating point cancellation at cuts/pages may produce -3.55e-15.
        // Clamp numerical residue only; reject a genuinely invalid source offset.
        const offset = s.offset < 0 && s.offset > -1e-7 ? 0 : s.offset;
        if (!Number.isFinite(offset) || offset < 0)
          throw Error("Offset audio non valido");
        const duration = Math.min(s.stop - s.start, buffer.duration - offset);
        if (duration <= 0) {
          node.disconnect();
          gain.disconnect();
          return;
        }
        node.start(Math.max(0, when), offset, duration);
        this.nodes.add(node);
        node.onended = () => {
          this.nodes.delete(node);
          node.disconnect();
          gain.disconnect();
        };
        this.scheduled.push({
          id: s.c.id,
          when,
          offset: offset + s.page * this.pageSeconds,
          duration: s.stop - s.start,
          start: s.start,
        });
      };
      segments.forEach((s, i) => {
        queued.add(s.c.id + ":" + s.page);
        scheduleOne(s, audio[i]);
      });
      this.timer = setInterval(() => {
        for (const s of this.segments(project, this.time())) {
          const key = s.c.id + ":" + s.page;
          if (queued.has(key)) continue;
          queued.add(key);
          this.buffer(s.c, s.m, s.page)
            .then((buffer) => scheduleOne(s, buffer))
            .catch((e) => {
              if (token !== this.generation) return;
              this.stop();
              this.onerror?.(e);
            });
        }
      }, 25);
      return true;
    }
  }
  root.AudioTransport = AudioTransport;
})(globalThis);
