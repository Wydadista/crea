"use strict";
let discardCurrent = false,
  recorderOpen = false,
  recordingCountdown = false,
  countdownCancel = false,
  recorderStarting = false,
  closeRecorderAfter = false,
  restartRecorderAfter = false;
let idleStream = null,
  idleContext = null,
  idleMeterTimer = null,
  idleGeneration = 0;
function stopIdleMonitor() {
  idleGeneration++;
  clearInterval(idleMeterTimer);
  idleMeterTimer = null;
  idleStream?.getTracks().forEach((t) => t.stop());
  idleStream = null;
  idleContext?.close();
  idleContext = null;
}
async function idleMonitor() {
  stopIdleMonitor();
  const generation = idleGeneration;
  if (!recorderOpen || recorder || finishing || recordingCountdown) return;
  let analyser = null;
  try {
    const id = $("microphoneDevice").value;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio:
        id && id !== "default" && id !== "missing"
          ? { deviceId: { exact: id } }
          : true,
      video: false,
    });
    if (generation !== idleGeneration) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    idleStream = stream;
    idleContext = new AudioContext();
    analyser = idleContext.createAnalyser();
    analyser.fftSize = 2048;
    idleContext.createMediaStreamSource(stream).connect(analyser);
    await idleContext.resume();
  } catch (error) {
    if (generation !== idleGeneration) return;
    toast("Monitor microfono: " + error.message);
  }
  const samples = new Float32Array(2048),
    meter = new MicMeter.Envelope();
  const paint = () => {
    if (!recorderOpen || recorder || finishing || recordingCountdown) return;
    samples.fill(0);
    analyser?.getFloatTimeDomainData(samples);
    studio
      .recordingToolbar({
        active: false,
        finishing: false,
        countdown: 0,
        paused: false,
        name: $("recordName").value,
        time: "00:00",
        ...meter.sample([samples], performance.now()),
        micActive: !!analyser,
      })
      .catch(() => {});
  };
  paint();
  idleMeterTimer = setInterval(paint, 80);
}
async function recorderReady() {
  if (closeRecorderAfter) {
    closeRecorderAfter = false;
    recorderOpen = false;
    stopIdleMonitor();
    await studio.closeRecorder();
    return;
  }
  if (restartRecorderAfter && recorderOpen) {
    restartRecorderAfter = false;
    $("startRecording").click();
    return;
  }
  if (recorderOpen) {
    await studio.recordingToolbar({
      active: false,
      finishing: false,
      countdown: 0,
      paused: false,
      time: "00:00",
      name: $("recordName").value,
    });
    await idleMonitor();
  }
}
const recordingSettings = showRecording;
showRecording = async function () {
  recorderOpen = true;
  if (recorder || finishing)
    return studio.recordingToolbar({
      active: !!recorder,
      finishing,
      time: recorder ? fmt(elapsedRecording()) : "00:00",
      name: $("recordName").value,
    });
  await recordingSettings(false);
  await recorderReady();
};
$("recordBtn").onclick = safe(showRecording);
$("railRecord").onclick = safe(showRecording);
const startImmediately = $("startRecording").onclick;
$("startRecording").onclick = safe(async () => {
  if (recorder || finishing || recordingCountdown || recorderStarting) return;
  recorderOpen = true;
  recordingCountdown = true;
  countdownCancel = false;
  discardCurrent = false;
  stopIdleMonitor();
  try {
    for (const count of [2, 1]) {
      await studio.recordingToolbar({
        active: false,
        countdown: count,
        finishing: false,
        time: String(count),
        name: $("recordName").value,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (countdownCancel) return;
    }
    recordingCountdown = false;
    recorderStarting = true;
    await studio.recordingToolbar({
      active: false,
      countdown: 0,
      finishing: true,
      time: "00:00",
      name: $("recordName").value,
    });
    await startImmediately();
    if (discardCurrent && recorder) await stopRecording();
  } finally {
    recordingCountdown = false;
    recorderStarting = false;
    if (!recorder && !finishing) await recorderReady();
  }
});
async function discardCapture() {
  if (recordingCountdown) {
    countdownCancel = true;
    return;
  }
  if (recorderStarting) {
    discardCurrent = true;
    return;
  }
  if (recorder && !finishing) {
    discardCurrent = true;
    overdub = null;
    await stopRecording();
  }
}
$("discardRecording").onclick = safe(discardCapture);
studio.onRecordingControl((action) =>
  safe(async () => {
    const type = typeof action === "string" ? action : action.type;
    if (type === "name") {
      if (!recorder && !finishing) {
        $("recordName").value = action.value;
        saveRecordingPrefs();
      }
      return;
    }
    if (type === "closed") {
      recorderOpen = false;
      stopIdleMonitor();
      return;
    }
    if (type === "settings") {
      if (recorder || finishing || recordingCountdown)
        return toast("Ferma la registrazione prima di cambiare impostazioni");
      await recordingSettings(true);
      return;
    }
    if (type === "start") {
      if ($("recordDialog").open) $("recordDialog").close();
      $("startRecording").click();
      return;
    }
    if (type === "pause") {
      toggleRecordingPause();
      return;
    }
    if (type === "stop") {
      if (recordingCountdown) {
        countdownCancel = true;
        return;
      }
      await stopRecording();
      return;
    }
    if (type === "discard") {
      await discardCapture();
      return;
    }
    if (type === "restart") {
      if (finishing || (!recorder && !recordingCountdown && !recorderStarting))
        return;
      restartRecorderAfter = true;
      await discardCapture();
      return;
    }
    if (type === "close") {
      if (finishing)
        return toast("Attendi la finalizzazione della registrazione");
      const choice = await showAppDialog({
        title: "Chiudere il registratore?",
        message: "La registrazione è ancora in corso.",
        buttons: ["Ferma e salva", "Scarta registrazione", "Annulla"],
        defaultId: 2,
        cancelId: 2,
      });
      if (choice === 2) return;
      restartRecorderAfter = false;
      closeRecorderAfter = true;
      if (recordingCountdown) {
        countdownCancel = true;
        return;
      }
      if (choice === 1) await discardCapture();
      else await stopRecording();
    }
  })(),
);
$("recordDialog").addEventListener("close", () => {
  if (!recorder && !finishing && !recordingCountdown && recorderOpen)
    idleMonitor();
});
window.addEventListener("beforeunload", stopIdleMonitor);
