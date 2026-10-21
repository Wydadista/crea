const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("recordingControls", {
  control: (a) => ipcRenderer.send("recording-control", a),
  onState: (fn) => ipcRenderer.on("recording-state", (_e, s) => fn(s)),
});
