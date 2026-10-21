const state = document.getElementById("state"),
  pause = document.getElementById("pause");
window.recordingControls.onState((s) => {
  state.textContent = (s.paused ? "Ⅱ PAUSA " : "● ") + s.time;
  pause.textContent = s.paused ? "Riprendi" : "Pausa";
  document.getElementById("level").value = s.level || 0;
});
pause.onclick = () => window.recordingControls.control("pause");
document.getElementById("stop").onclick = () =>
  window.recordingControls.control("stop");
