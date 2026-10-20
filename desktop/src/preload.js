const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("studio", {
  importMedia: () => ipcRenderer.invoke("import"),
  importPaths: (files) => ipcRenderer.invoke("import-paths", files),
  filePath: (file) => webUtils.getPathForFile(file),
  sources: () => ipcRenderer.invoke("sources"),
  chooseSource: (source) => ipcRenderer.invoke("choose-source", source),
  platform: () => ipcRenderer.invoke("platform"),
  beginRecording: (settings) => ipcRenderer.invoke("recording-begin", settings),
  waveform: (file) => ipcRenderer.invoke("waveform", file),
  fonts: () => ipcRenderer.invoke("fonts"),
  appendRecording: (buffer) => ipcRenderer.invoke("recording-chunk", buffer),
  finishRecording: () => ipcRenderer.invoke("recording-finish"),
  abortRecording: () => ipcRenderer.invoke("recording-abort"),
  saveProject: (project) => ipcRenderer.invoke("save-project", project),
  openProject: () => ipcRenderer.invoke("open-project"),
  exportVideo: (project, settings) =>
    ipcRenderer.invoke("export", project, settings),
  cancelExport: () => ipcRenderer.invoke("cancel-export"),
  onProgress: (fn) => {
    const handler = (_event, p) => fn(p);
    ipcRenderer.on("export-progress", handler);
    return () => ipcRenderer.removeListener("export-progress", handler);
  },
});
