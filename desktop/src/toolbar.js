const $ = (id) => document.getElementById(id);
let lastState = {};
recordingControls.onState((s) => {
  lastState = s;
  const busy = s.active || s.countdown || s.finishing;
  $("state").textContent = s.countdown
    ? String(s.countdown)
    : (s.paused ? "Ⅱ " : "") + (s.time || "00:00");
  $("message").textContent = s.countdown
    ? "Registrazione tra " + s.countdown + "…"
    : s.finishing
      ? "Preparazione / salvataggio…"
      : s.active
        ? s.paused
          ? "Registrazione in pausa"
          : "Registrazione in corso"
        : "Pronto per una nuova registrazione";
  $("pause").textContent = s.paused ? "Riprendi" : "Pausa";
  $("pause").disabled = !s.active || s.finishing;
  $("stop").disabled = !s.active && !s.countdown;
  $("discard").disabled = (!s.active && !s.countdown) || s.finishing;
  $("start").disabled = !!busy;
  $("settings").disabled = !!busy;
  $("name").disabled = !!busy;
  if (document.activeElement !== $("name") && s.name !== undefined)
    $("name").value = s.name;
  MicMeter.paint($("level"), $("peak"), $("db"), $("micStatus"), s, s.paused);
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
  ["discard", "discard"],
  ["settings", "settings"],
])
  $(id).onclick = () => recordingControls.control(action);
