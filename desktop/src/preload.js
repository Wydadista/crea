const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("studio", {
  stingers: () => ipcRenderer.invoke("stingers-list"),
  saveStinger: (project, ids, name) =>
    ipcRenderer.invoke("stingers-save", project, ids, name),
  loadStinger: (id) => ipcRenderer.invoke("stingers-load", id),
  removeStinger: (id) => ipcRenderer.invoke("stingers-remove", id),
  preferences: () => ipcRenderer.invoke("preferences"),
  setPreferences: (v) => ipcRenderer.invoke("set-preferences", v),
  chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
  chooseExport: (options) => ipcRenderer.invoke("choose-export", options),
  thumbnail: (file, t) => ipcRenderer.invoke("thumbnail", file, t),
  freezeFrame: (m, t) => ipcRenderer.invoke("freeze-frame", m, t),
  closeRecorder: () => ipcRenderer.invoke("close-recorder"),
  recordingToolbar: (state) => ipcRenderer.invoke("recording-toolbar", state),
  onRecordingControl: (fn) =>
    ipcRenderer.on("recording-control", (_e, a) => fn(a)),
  onRecordingProgress: (fn) =>
    ipcRenderer.on("recording-progress", (_e, p) => fn(p)),
  onAudioPreparationProgress: (fn) =>
    ipcRenderer.on("audio-preparation-progress", (_e, p) => fn(p)),
  autosave: (p) => ipcRenderer.invoke("autosave", p),
  recover: () => ipcRenderer.invoke("recover"),
  projectFile: () => ipcRenderer.invoke("project-file"),
  onProjectFile: (fn) => ipcRenderer.on("project-file", () => fn()),
  encoders: () => ipcRenderer.invoke("encoders"),
  audioData: (c, m, page) => ipcRenderer.invoke("audio-data", c, m, page),
  audioPreview: (c, m) => ipcRenderer.invoke("audio-preview", c, m),
  importMedia: () => ipcRenderer.invoke("import"),
  importPaths: (files) => ipcRenderer.invoke("import-paths", files),
  filePath: (file) => webUtils.getPathForFile(file),
  sources: () => ipcRenderer.invoke("sources"),
  chooseSource: (source) => ipcRenderer.invoke("choose-source", source),
  platform: () => ipcRenderer.invoke("platform"),
  beginRecording: (settings) => ipcRenderer.invoke("recording-begin", settings),
  waveform: (file, channels) => ipcRenderer.invoke("waveform", file, channels),
  fonts: () => ipcRenderer.invoke("fonts"),
  appendRecording: (buffer) => ipcRenderer.invoke("recording-chunk", buffer),
  finishRecording: (duration) =>
    ipcRenderer.invoke("recording-finish", duration),
  abortRecording: () => ipcRenderer.invoke("recording-abort"),
  saveProject: (project, options) =>
    ipcRenderer.invoke("save-project", project, options),
  projectInfo: () => ipcRenderer.invoke("project-info"),
  recentProjects: () => ipcRenderer.invoke("recent-projects"),
  onAppDialog: (fn) =>
    ipcRenderer.on("app-dialog", (_event, request) => fn(request)),
  respondAppDialog: (id, response) =>
    ipcRenderer.invoke("app-dialog-response", id, response),
  confirmUnsaved: () => ipcRenderer.invoke("confirm-unsaved"),
  resetProject: () => ipcRenderer.invoke("reset-project"),
  quitApproved: () => ipcRenderer.invoke("quit-approved"),
  onCloseRequest: (fn) => ipcRenderer.on("close-request", () => fn()),
  openProject: (file) => ipcRenderer.invoke("open-project", file),
  openExport: (kind) => ipcRenderer.invoke("open-export", kind),
  exportVideo: (project, settings) =>
    ipcRenderer.invoke("export", project, settings),
  cancelExport: () => ipcRenderer.invoke("cancel-export"),
  onProgress: (fn) => {
    const handler = (_event, p) => fn(p);
    ipcRenderer.on("export-progress", handler);
    return () => ipcRenderer.removeListener("export-progress", handler);
  },
});
