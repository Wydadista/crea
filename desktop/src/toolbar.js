const state = document.getElementById("state"),
  pause = document.getElementById("pause");
window.recordingControls.onState((s) => {
  state.textContent = (s.paused ? "Ⅱ PAUSA " : "● ") + s.time;
  pause.textContent = s.paused ? "Riprendi" : "Pausa";
  MicMeter.paint(
    document.getElementById("level"),
    document.getElementById("peak"),
    document.getElementById("db"),
    document.getElementById("micStatus"),
    s,
    s.paused,
  );
});
pause.onclick = () => window.recordingControls.control("pause");
document.getElementById("stop").onclick = () =>
  window.recordingControls.control("stop");
