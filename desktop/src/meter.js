/* Display-only dBFS metering. This code never changes an audio sample or gain. */
(function (root) {
  const db = (value) => 20 * Math.log10(Math.max(1e-6, value));
  class MicMeter {
    constructor() {
      this.envelope = 0;
      this.heldPeak = -60;
      this.holdUntil = 0;
      this.time = null;
      this.clipUntil = -Infinity;
    }
    sample(samples, now) {
      let rms = 0,
        peak = 0;
      for (const channel of Array.isArray(samples) ? samples : [samples]) {
        let squares = 0;
        for (const value of channel) {
          squares += value * value;
          peak = Math.max(peak, Math.abs(value));
        }
        rms = Math.max(rms, Math.sqrt(squares / Math.max(1, channel.length)));
      }
      const elapsed =
        this.time === null ? 33 : Math.max(1, Math.min(1000, now - this.time));
      this.time = now;
      const tau = rms > this.envelope ? 25 : 300;
      this.envelope += (rms - this.envelope) * (1 - Math.exp(-elapsed / tau));
      const peakDb = db(peak);
      if (peakDb >= -1) this.clipUntil = now + 800;
      if (peakDb >= this.heldPeak) {
        this.heldPeak = peakDb;
        this.holdUntil = now + 1000;
      } else if (now > this.holdUntil)
        this.heldPeak = Math.max(-60, this.heldPeak - elapsed * 0.02);
      const rmsDb = db(rms),
        displayDb = db(this.envelope);
      return {
        level: Math.max(0, Math.min(1, (displayDb + 60) / 60)),
        rmsDb,
        peakDb,
        peakHoldDb: this.heldPeak,
        status: now < this.clipUntil ? "clip" : rmsDb < -42 ? "low" : "ok",
      };
    }
  }
  function label(state) {
    return (state.rmsDb <= -60 ? "≤ −60" : state.rmsDb.toFixed(0)) + " dBFS";
  }
  function paint(fill, peak, labelNode, statusNode, state, paused = false) {
    fill.style.transform = `scaleX(${paused ? 0 : state.level})`;
    fill.dataset.status = paused ? "paused" : state.status;
    peak.style.left =
      Math.max(0, Math.min(1, (state.peakHoldDb + 60) / 60)) * 100 + "%";
    labelNode.textContent = paused
      ? "PAUSA"
      : state.micActive === false
        ? "Microfono spento"
        : label(state);
    statusNode.textContent = paused
      ? "In pausa"
      : state.micActive === false
        ? ""
        : state.status === "clip"
          ? "Picco vicino a 0 dBFS"
          : state.status === "low"
            ? "Segnale basso"
            : "";
  }
  root.MicMeter = { Envelope: MicMeter, db, label, paint };
  if (typeof module !== "undefined") module.exports = root.MicMeter;
})(typeof window !== "undefined" ? window : globalThis);
