const $ = (id) => document.getElementById(id);
let lastState = {};
recordingControls.onState((s) => {
  lastState = s;
  const busy = s.active || s.countdown || s.finishing;
  document.body.classList.toggle("compact", !!busy);
  $("state").textContent = s.countdown
    ? String(s.countdown)
    : (s.paused ? "Ⅱ " : "") + (s.time || "00:00");
  $("state").title = s.finishing
    ? "Preparazione / salvataggio…"
    : s.countdown
      ? "Conto alla rovescia"
      : "Tempo registrato";
  $("pause").textContent = s.paused ? "▶" : "⏸";
  $("pause").title = s.paused ? "Riprendi" : "Pausa";
  $("pause").setAttribute("aria-label", $("pause").title);
  $("pause").disabled = !s.active || s.finishing;
  $("stop").disabled = !s.active && !s.countdown;
  $("discard").disabled = (!s.active && !s.countdown) || s.finishing;
  $("discard").title = busy ? "Scarta e ricomincia" : "Scarta registrazione";
  $("discard").setAttribute("aria-label", $("discard").title);
  $("discard").textContent = busy ? "↻" : "Scarta";
  $("start").disabled = !!busy;
  $("settings").disabled = !!busy;
  $("name").disabled = !!busy;
  if (document.activeElement !== $("name") && s.name !== undefined)
    $("name").value = s.name;
  $("level").style.transform = `scaleX(${s.paused ? 0 : s.level || 0})`;
  $("peak").style.left =
    Math.max(0, Math.min(100, (((s.peakHoldDb ?? -60) + 60) / 60) * 100)) + "%";
  $("level").parentElement.setAttribute(
    "aria-valuenow",
    Math.round((s.level || 0) * 100),
  );
});
$("name").oninput = () =>
  recordingControls.control({ type: "name", value: $("name").value });
$("name").onkeydown = (e) => {
  if (e.key === "Enter" && !$("start").disabled) {
    e.preventDefault();
    $("start").click();
  }
};
for (const [id, action] of [
  ["start", "start"],
  ["pause", "pause"],
  ["stop", "stop"],
  ["settings", "settings"],
])
  $(id).onclick = () => recordingControls.control(action);
$("discard").onclick = () =>
  recordingControls.control(
    lastState.active || lastState.countdown ? "restart" : "discard",
  );

$("minimize").onclick = () => recordingControls.control("minimize");
$("close").onclick = () => recordingControls.control("close-window");
