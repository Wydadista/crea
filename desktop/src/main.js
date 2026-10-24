const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
  session,
  shell,
  screen,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
const Timeline = require("./model");
const { renderProject, encoding } = require("./render");
const { waveform } = require("./waveform");
const unpack = (p) =>
  app.isPackaged ? p.replace(/app\.asar([/\\])/, "app.asar.unpacked$1") : p;
const binaries = {
  ffmpeg: unpack(require("ffmpeg-static")),
  ffprobe: unpack(require("ffprobe-static").path),
};
let recordingToolbar;
let win, chosenSource, exportController, lastExport;
let projectPath = null,
  savedProject = null,
  savingProject = false;
const { collectProject, safeName, reserveRecording } = require("./storage");
const { Recording } = require("./recording");
const preferencesFile = () =>
  path.join(app.getPath("userData"), "preferences.json");
if (process.platform === "win32") app.setAppUserModelId("it.crea.studio");
async function preferences() {
  let saved = {};
  try {
    saved = JSON.parse(await fs.readFile(preferencesFile(), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return {
    projects: path.join(app.getPath("documents"), "AKhbar studio"),
    exports: app.getPath("downloads"),
    recordings: path.join(
      app.getPath("documents"),
      "AKhbar studio",
      "Registrazioni",
    ),
    imageDuration: 5,
    freezeDuration: 5,
    rulerColor: "#335d80",
    ...saved,
  };
}
ipcMain.handle("preferences", preferences);
ipcMain.handle("set-preferences", async (_e, values) => {
  const current = await preferences();
  for (const key of ["projects", "exports", "recordings"])
    if (typeof values[key] === "string" && path.isAbsolute(values[key]))
      current[key] = values[key];
  for (const key of ["imageDuration", "freezeDuration"])
    if (values[key] !== undefined) {
      const value = Number(String(values[key]).replace(",", "."));
      if (!Number.isFinite(value) || value < 0.01 || value > 86400)
        throw Error("Durata: da 0,01 a 86400 secondi");
      current[key] = value;
    }
  if (/^#[0-9a-f]{6}$/i.test(values.rulerColor || ""))
    current.rulerColor = values.rulerColor;
  await atomic(preferencesFile(), current);
  return current;
});
ipcMain.handle("choose-directory", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
  });
  return r.canceled ? null : r.filePaths[0];
});
const projectArgument = () =>
  process.argv.find((a) => /\.(creastudio|crea\.json)$/i.test(a));
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_e, argv) => {
  const file = argv.find((a) => /\.(creastudio|crea\.json)$/i.test(a));
  if (file) {
    pendingProject = file;
    win?.webContents.send("project-file", file);
  }
  win?.show();
  win?.focus();
});
let pendingProject = projectArgument();
async function atomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(data, null, 2));
  await fs.rename(temp, file);
}
const recoveryPath = () =>
  path.join(app.getPath("userData"), "recovery.creastudio");
async function inspect(file) {
  const { stdout } = await promisify(execFile)(
    binaries.ffprobe,
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout),
    video = data.streams.find((s) => s.codec_type === "video");
  const image = /\.(png|jpe?g|webp|bmp)$/i.test(file);
  const kind = image ? "image" : video ? "video" : "audio";
  const duration = image ? 5 : Number(data.format.duration || video?.duration);
  if (!Number.isFinite(duration) || duration <= 0)
    throw Error("Durata non riconosciuta: " + path.basename(file));
  if (!video && !data.streams.some((s) => s.codec_type === "audio"))
    throw Error("File multimediale non supportato");
  return {
    id: randomUUID(),
    path: file,
    url: pathToFileURL(file).href,
    name: path.basename(file),
    kind,
    duration,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
    codec: video?.codec_name,
    codecProfile: video?.profile,
    pixelFormat: video?.pix_fmt,
    fileBitrate: Number(data.format.bit_rate || 0),
    fps: video?.avg_frame_rate,
    audioChannels: data.streams.find((s) => s.codec_type === "audio")?.channels,
    width: video?.width,
    height: video?.height,
  };
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(
        contents === win?.webContents &&
          ["media", "display-capture"].includes(permission),
      ),
  );
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
        });
        const source = sources.find((s) => s.id === chosenSource?.id);
        if (!source) return callback({});
        callback({
          video: source,
          ...(chosenSource.systemAudio && process.platform === "win32"
            ? { audio: "loopback" }
            : {}),
        });
      } catch {
        callback({});
      }
    },
  );
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1500, workArea.width),
    height: Math.min(950, workArea.height),
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#15191f",
    title: "AKhbar studio",
    icon: path.join(__dirname, "project-icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  if (process.platform === "win32" && app.isPackaged)
    win.setAppDetails({
      appId: "it.crea.studio",
      appIconPath: process.execPath,
      appIconIndex: 0,
      relaunchCommand: `"${process.execPath}"`,
      relaunchDisplayName: "AKhbar studio",
    });
  win.on("close", (event) => {
    if (!allowClose) {
      event.preventDefault();
      win.webContents.send("close-request");
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, "index.html"));
  if (process.env.CREA_SMOKE_TEST === "1")
    win.webContents.once("did-finish-load", async () => {
      try {
        const result = await win.webContents.executeJavaScript(
          `({title:document.title, timeline:!!document.getElementById('timeline'), bridge:typeof studio.importMedia})`,
        );
        console.log("CREA_SMOKE", JSON.stringify(result));
        app.exit(result.timeline && result.bridge === "function" ? 0 : 1);
      } catch (e) {
        console.error(e);
        app.exit(1);
      }
    });
});
app.on("window-all-closed", () => app.quit());
ipcMain.handle("import", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Video, immagini e audio",
        extensions: [
          "mp4",
          "mov",
          "mkv",
          "webm",
          "avi",
          "m4v",
          "png",
          "jpg",
          "jpeg",
          "webp",
          "bmp",
          "mp3",
          "wav",
          "m4a",
          "ogg",
          "flac",
          "aac",
        ],
      },
    ],
  });
  if (result.canceled) return { media: [], errors: [] };
  return importFiles(result.filePaths);
});
async function importFiles(files) {
  const media = [],
    errors = [];
  for (const file of files)
    try {
      media.push(await inspect(file));
    } catch (e) {
      errors.push(e.message);
    }
  return { media, errors };
}
ipcMain.handle("import-paths", (_e, files) => importFiles(files));
ipcMain.handle("sources", async () =>
  (
    await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 240, height: 135 },
    })
  ).map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  })),
);
ipcMain.handle("choose-source", (_e, value) => {
  chosenSource = value;
});
ipcMain.handle("platform", () => process.platform);
let recordingFile = null;
ipcMain.handle("recording-begin", async (_e, settings) => {
  encoding(settings);
  if (
    !Number.isInteger(settings.audioBitrate) ||
    settings.audioBitrate < 32 ||
    settings.audioBitrate > 320
  )
    throw Error("Bitrate audio: 32–320 kbps");
  if (!["mp4", "webm"].includes(settings.format))
    throw Error("Formato registrazione non valido");
  if (recordingFile) throw Error("Registrazione già attiva");
  const prefs = await preferences();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akhbar-record-"));
  const folder = prefs.recordings;
  const name = safeName(settings.name),
    counters = prefs.recordingCounters || {};
  const output = await reserveRecording(
    folder,
    name,
    settings.audioOnly ? "wav" : settings.format,
    counters[name] || 1,
  );
  counters[name] = Number(path.basename(output).match(/-(\d+)\.[^.]+$/)[1]) + 1;
  await atomic(preferencesFile(), {
    ...(await preferences()),
    recordingCounters: counters,
  });
  try {
    recordingFile = await new Recording(
      binaries.ffmpeg,
      dir,
      output,
      settings,
      (p) => win?.webContents.send("recording-progress", p),
    ).begin();
  } catch (e) {
    await fs.rm(output, { force: true });
    await fs.rm(dir, { recursive: true, force: true });
    throw e;
  }
});
ipcMain.handle("recording-chunk", (_e, buffer) => {
  if (!recordingFile) throw Error("Registrazione non attiva");
  return recordingFile.append(buffer);
});
async function discardRecording() {
  if (!recordingFile) return;
  const current = recordingFile;
  recordingFile = null;
  await current.dispose();
  // A reserved zero-byte name is removed on abort. Completed files are preserved.
  try {
    if ((await fs.stat(current.output)).size === 0) await fs.rm(current.output);
  } catch {}
}
ipcMain.handle("recording-abort", discardRecording);
ipcMain.handle("recording-finish", async (_e, duration) => {
  if (!recordingFile) throw Error("Nessuna registrazione da salvare");
  const current = recordingFile;
  if (Number.isFinite(duration) && duration > 0)
    current.settings.captureDuration = duration;
  let ready = false;
  try {
    const file = await current.finish();
    ready = true;
    const at = performance.now(),
      media = await inspect(file);
    win?.webContents.send("recording-progress", {
      phase: "Clip disponibile; forma d’onda in background",
      percent: 100,
      metrics: { ...current.metrics, importMs: performance.now() - at },
    });
    media.recordingInfo = {
      ...current.metrics,
      width: media.width,
      height: media.height,
      fps: media.fps,
      codec: media.codec,
    };
    return media;
  } catch (e) {
    if (!ready) {
      const backup = current.output + ".recupero" + path.extname(current.input);
      try {
        await fs.copyFile(current.input, backup);
        e.message += " · Cattura originale conservata in " + backup;
      } catch {
        recordingFile = null;
        e.message += " · Cattura recuperabile in " + current.input;
      }
    }
    throw e;
  } finally {
    await discardRecording();
  }
});
let recorderWindowState = { active: false, time: "00:00" };
ipcMain.handle("recording-toolbar", async (_e, state) => {
  if (!state) {
    if (!recordingToolbar) return;
    state = { active: false, finishing: true, time: "00:00" };
  }
  recorderWindowState = { ...recorderWindowState, ...state };
  if (!recordingToolbar) {
    const area = screen.getPrimaryDisplay().workArea;
    recordingToolbar = new BrowserWindow({
      width: 1080,
      height: 76,
      minWidth: 1080,
      minHeight: 76,
      title: "AKhbar studio · Registratore",
      icon: path.join(__dirname, "project-icon.ico"),
      x: area.x + 30,
      y: area.y + 30,
      frame: false,
      resizable: false,
      maximizable: false,
      backgroundColor: "#000000",
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "toolbar-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    recordingToolbar.setMenu(null);
    recordingToolbar.setContentProtection(true);

    recordingToolbar.setVisibleOnAllWorkspaces(true);
    recordingToolbar.on("close", (event) => {
      if (
        recorderWindowState.active ||
        recorderWindowState.countdown ||
        recorderWindowState.finishing
      ) {
        event.preventDefault();
        win?.show();
        win?.focus();
        win?.webContents.send("recording-control", "close");
      } else win?.webContents.send("recording-control", "closed");
    });
    recordingToolbar.on("closed", () => (recordingToolbar = null));
    await recordingToolbar.loadFile(path.join(__dirname, "toolbar.html"));
    recordingToolbar.show();
  }
  if (recordingToolbar && !recordingToolbar.isDestroyed()) {
    const pinned = !!(
      recorderWindowState.active ||
      recorderWindowState.countdown ||
      recorderWindowState.finishing
    );
    if (recordingToolbar.isAlwaysOnTop() !== pinned)
      recordingToolbar.setAlwaysOnTop(pinned, "floating");
    recordingToolbar.webContents.send("recording-state", recorderWindowState);
  }
});
ipcMain.on("recording-control", (event, action) => {
  if (event.sender === recordingToolbar?.webContents && action === "minimize")
    return recordingToolbar.minimize();
  if (
    event.sender === recordingToolbar?.webContents &&
    action === "close-window"
  )
    return recordingToolbar.close();
  if (
    event.sender === recordingToolbar?.webContents &&
    ["pause", "stop", "start", "discard", "settings", "name"].includes(
      typeof action === "string" ? action : action?.type,
    )
  ) {
    if (action === "settings") {
      win?.show();
      win?.focus();
    }
    win?.webContents.send(
      "recording-control",
      typeof action === "object"
        ? { type: action.type, value: String(action.value || "").slice(0, 128) }
        : action,
    );
  }
});
ipcMain.handle("close-recorder", () => {
  recordingToolbar?.destroy();
  recordingToolbar = null;
});
app.on("before-quit", () => recordingToolbar?.destroy());
const thumbnailCache = new Map();
ipcMain.handle("thumbnail", async (_e, file, seconds = 0) => {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error("Tempo non valido");
  const stat = await fs.stat(file),
    key = file + stat.mtimeMs + ":" + seconds.toFixed(4);
  if (!thumbnailCache.has(key))
    thumbnailCache.set(
      key,
      (async () => {
        const dir = path.join(os.tmpdir(), "akhbar-thumbnails");
        await fs.mkdir(dir, { recursive: true });
        const output = path.join(
          dir,
          require("node:crypto")
            .createHash("sha256")
            .update(key)
            .digest("hex") + ".jpg",
        );
        await promisify(execFile)(
          binaries.ffmpeg,
          [
            "-v",
            "error",
            "-y",
            "-ss",
            String(seconds),
            "-i",
            file,
            "-frames:v",
            "1",
            "-vf",
            "scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2",
            "-threads",
            "1",
            output,
          ],
          { windowsHide: true },
        );
        return pathToFileURL(output).href;
      })().catch((e) => {
        thumbnailCache.delete(key);
        throw e;
      }),
    );
  return thumbnailCache.get(key);
});
ipcMain.handle("freeze-frame", async (_e, media, seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > media.duration)
    throw Error("Fotogramma non valido");
  const prefs = await preferences(),
    folder = path.join(
      projectPath ? path.dirname(projectPath) : prefs.projects,
      "Fermi immagine",
    );
  await fs.mkdir(folder, { recursive: true });
  const output = path.join(folder, randomUUID() + ".png");
  await promisify(execFile)(
    binaries.ffmpeg,
    [
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      media.path,
      "-frames:v",
      "1",
      "-threads",
      "1",
      output,
    ],
    { windowsHide: true },
  );
  return inspect(output);
});
async function loadProject(file) {
  const raw = JSON.parse(await fs.readFile(file, "utf8"));
  for (const m of raw.media || [])
    if (m.path && !path.isAbsolute(m.path))
      m.path = path.resolve(path.dirname(file), m.path);
  const project = Timeline.validate(raw);
  const missing = [];
  for (const m of project.media) {
    if (["annotation", "effect"].includes(m.kind)) continue;
    try {
      await fs.access(m.path);
    } catch {
      missing.push(m.name);
    }
    m.url = pathToFileURL(m.path).href;
  }
  if (missing.length)
    throw Error("File originali mancanti: " + missing.join(", "));
  return project;
}
async function rememberProject(file) {
  const prefs = await preferences();
  const recent = [
    file,
    ...(prefs.recentProjects || []).filter(
      (p) =>
        typeof p === "string" &&
        path.resolve(p).toLowerCase() !== path.resolve(file).toLowerCase(),
    ),
  ].slice(0, 12);
  await atomic(preferencesFile(), { ...prefs, recentProjects: recent });
}
ipcMain.handle("project-info", () => ({
  path: projectPath,
  name: projectPath ? path.basename(projectPath, ".creastudio") : null,
}));
ipcMain.handle(
  "recent-projects",
  async () => (await preferences()).recentProjects || [],
);
// App confirmations live in the editor, including prompts requested by main-process work.
const pendingDialogs = new Map();
function appDialog(options) {
  const cancel = options.cancelId ?? options.buttons.length - 1;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed())
    return Promise.resolve({ response: cancel });
  const requestId = randomUUID();
  return new Promise((resolve) => {
    const contents = win.webContents;
    const finish = (response) => {
      pendingDialogs.delete(requestId);
      contents.removeListener("destroyed", aborted);
      contents.removeListener("render-process-gone", aborted);
      resolve({ response });
    };
    const aborted = () => finish(cancel);
    pendingDialogs.set(requestId, { finish, buttons: options.buttons });
    contents.once("destroyed", aborted);
    contents.once("render-process-gone", aborted);
    contents.send("app-dialog", {
      requestId,
      options: { ...options, cancelId: cancel },
    });
  });
}
ipcMain.handle("app-dialog-response", (event, requestId, response) => {
  if (event.sender !== win?.webContents) return false;
  const pending = pendingDialogs.get(requestId);
  if (
    !pending ||
    !Number.isInteger(response) ||
    response < 0 ||
    response >= pending.buttons.length
  )
    return false;
  pending.finish(response);
  return true;
});
ipcMain.handle("confirm-unsaved", async () => {
  const r = await appDialog({
    type: "question",
    buttons: ["Salva", "Scarta modifiche", "Annulla"],
    defaultId: 0,
    cancelId: 2,
    title: "Vuoi salvare il progetto?",
    message: "Ci sono modifiche non salvate",
    detail:
      "Salva il tuo montaggio prima di continuare, oppure prosegui senza conservare le ultime modifiche.",
  });
  return ["save", "discard", "cancel"][r.response];
});
let autosaveQueue = Promise.resolve(),
  projectEpoch = 0,
  allowClose = false;
ipcMain.handle("reset-project", async () => {
  projectEpoch++;
  await autosaveQueue;
  projectPath = null;
  savedProject = null;
  pendingProject = null;
  await fs.rm(recoveryPath(), { force: true });
  return true;
});
ipcMain.handle("quit-approved", () => {
  allowClose = true;
  app.quit();
});
ipcMain.handle("save-project", async (_e, input, options = {}) => {
  if (savingProject) return false;
  savingProject = true;
  try {
    const project = Timeline.validate(input);
    let target = projectPath;
    if (!target || options.saveAs) {
      if (options.name !== undefined) {
        const name = safeName(options.name, "Montaggio");
        target = path.join(
          (await preferences()).projects,
          name,
          name + ".creastudio",
        );
        try {
          await fs.access(target);
          const r = await appDialog({
            type: "question",
            buttons: ["Sostituisci", "Annulla"],
            defaultId: 1,
            cancelId: 1,
            message: "Esiste già un progetto con questo nome. Sostituirlo?",
          });
          if (r.response !== 0) return false;
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      } else {
        const r = await dialog.showSaveDialog(win, {
          defaultPath: path.join(
            (await preferences()).projects,
            "Montaggio.creastudio",
          ),
          filters: [
            { name: "Progetto AKhbar studio", extensions: ["creastudio"] },
          ],
        });
        if (r.canceled) return false;
        target = path.join(
          path.dirname(r.filePath),
          safeName(path.basename(r.filePath, path.extname(r.filePath))),
          path.basename(r.filePath),
        );
      }
    }
    if (
      !project.assetsCollected &&
      path.basename(path.dirname(target)) !==
        path.basename(target, path.extname(target))
    )
      target = path.join(
        path.dirname(target),
        safeName(path.basename(target, path.extname(target))),
        path.basename(target),
      );
    if (
      project.media.some(
        (m) =>
          m.path &&
          path.resolve(m.path).toLowerCase() ===
            path.resolve(target).toLowerCase(),
      )
    )
      throw Error("Non sovrascrivere un file multimediale con il progetto");
    await collectProject(project, target);
    projectPath = target;
    savedProject = JSON.stringify(project);
    await fs.rm(recoveryPath(), { force: true });
    await rememberProject(target);
    return true;
  } finally {
    savingProject = false;
  }
});
ipcMain.handle("open-project", async (_e, recent) => {
  const result = recent
    ? { filePaths: [recent] }
    : await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [
          {
            name: "Progetti AKhbar studio (anche precedenti)",
            extensions: ["creastudio", "json"],
          },
        ],
      });
  if (result.canceled) return null;
  const data = await loadProject(result.filePaths[0]);
  projectEpoch++;
  await autosaveQueue;
  projectPath = /\.creastudio$/i.test(result.filePaths[0])
    ? result.filePaths[0]
    : null;
  savedProject = JSON.stringify(data);
  await fs.rm(recoveryPath(), { force: true });
  await rememberProject(result.filePaths[0]);
  return data;
});
ipcMain.handle("project-file", async () => {
  if (!pendingProject) return null;
  const file = pendingProject;
  pendingProject = null;
  const data = await loadProject(file);
  projectEpoch++;
  await autosaveQueue;
  projectPath = /\.creastudio$/i.test(file) ? file : null;
  savedProject = JSON.stringify(data);
  await fs.rm(recoveryPath(), { force: true });
  await rememberProject(file);
  return data;
});
ipcMain.handle("autosave", (_e, project) => {
  const epoch = projectEpoch,
    location = projectPath;
  const job = autosaveQueue.then(async () => {
    if (epoch !== projectEpoch || JSON.stringify(project) === savedProject)
      return;
    await atomic(recoveryPath(), {
      project: Timeline.validate(project),
      path: location,
      savedAt: Date.now(),
    });
  });
  autosaveQueue = job.catch(() => {});
  return job;
});
ipcMain.handle("recover", async () => {
  try {
    const data = JSON.parse(await fs.readFile(recoveryPath(), "utf8"));
    const result = await appDialog({
      type: "question",
      buttons: ["Recupera montaggio", "Ignora"],
      defaultId: 0,
      message:
        "È disponibile un salvataggio automatico del " +
        new Date(data.savedAt).toLocaleString("it-IT") +
        ". Recuperarlo?",
    });
    if (result.response !== 0) {
      await fs.rm(recoveryPath(), { force: true });
      return null;
    }
    projectPath = data.path || null;
    const project = Timeline.validate(data.project);
    for (const m of project.media)
      if (m.path) m.url = pathToFileURL(m.path).href;
    return project;
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
});
ipcMain.handle("encoders", () => require("./encoders").detect(binaries.ffmpeg));
const processedAudio = new Map();
const previewAudioController = new AbortController();
app.on("before-quit", () => previewAudioController.abort());
const continuousAudio = (c) =>
  !c.voice?.bypass && (c.voice?.noise > 0 || c.voice?.level > 0);
async function previewAudio(clip, media, page = 0) {
  media = await require("./deepfilter").denoisedMedia(
    clip,
    media,
    binaries.ffmpeg,
    previewAudioController.signal,
  );
  const { audioFilters } = require("./audio");
  const effects = await audioFilters(clip, media, binaries.ffmpeg);
  const processing = [effects, require("./render").tempo(clip.speed || 1)]
    .filter(Boolean)
    .join(",");
  const stat = await fs.stat(media.path);
  const continuous = continuousAudio(clip);
  const key =
    media.path + stat.mtimeMs + processing + ":" + (continuous ? "all" : page);
  if (!processedAudio.has(key))
    processedAudio.set(
      key,
      (async () => {
        const dir = path.join(os.tmpdir(), "crea-audio-preview");
        await fs.mkdir(dir, { recursive: true });
        const file = path.join(
          dir,
          require("node:crypto")
            .createHash("sha256")
            .update(key)
            .digest("hex") + ".wav",
        );
        await promisify(execFile)(
          binaries.ffmpeg,
          [
            "-v",
            "error",
            "-y",
            ...(continuous
              ? []
              : [
                  "-ss",
                  String(page * 30 * (clip.speed || 1)),
                  "-t",
                  String(30 * (clip.speed || 1)),
                ]),
            "-i",
            media.path,
            "-vn",
            "-af",
            processing || "anull",
            "-rf64",
            "auto",
            "-ac",
            "2",
            "-ar",
            "48000",
            file,
          ],
          { windowsHide: true, signal: previewAudioController.signal },
        );
        return pathToFileURL(file).href;
      })().catch((e) => {
        processedAudio.delete(key);
        throw e;
      }),
    );
  return processedAudio.get(key);
}
ipcMain.handle("audio-preview", (_e, c, m) => previewAudio(c, m));
ipcMain.handle("audio-data", async (_e, c, m, page = 0) => {
  if (!Number.isInteger(page) || page < 0 || page > 201600)
    throw Error("Pagina audio non valida");
  const url = await previewAudio(c, m, page),
    file = require("node:url").fileURLToPath(url),
    handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(65536);
    const read = await handle.read(header, 0, header.length, 0);
    let at = 12,
      dataOffset;
    while (at + 8 <= read.bytesRead) {
      const kind = header.toString("ascii", at, at + 4),
        size = header.readUInt32LE(at + 4);
      if (kind === "data") {
        dataOffset = at + 8;
        break;
      }
      at += 8 + size + (size % 2);
    }
    if (dataOffset === undefined) throw Error("PCM anteprima non riconosciuto");
    const byteOffset =
        dataOffset + (continuousAudio(c) ? page * 30 * 48000 * 4 : 0),
      stat = await handle.stat(),
      length = Math.max(0, Math.min(30 * 48000 * 4, stat.size - byteOffset));
    if (!length)
      throw Error("Audio sorgente non disponibile in questo intervallo");
    const pcm = Buffer.alloc(length);
    let count = 0;
    while (count < length) {
      const r = await handle.read(
        pcm,
        count,
        length - count,
        byteOffset + count,
      );
      if (!r.bytesRead) break;
      count += r.bytesRead;
    }
    const wav = Buffer.alloc(44 + count);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(48000, 24);
    wav.writeUInt32LE(192000, 28);
    wav.writeUInt16LE(4, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(count, 40);
    pcm.copy(wav, 44, 0, count);
    return wav;
  } finally {
    await handle.close();
  }
});
ipcMain.handle("choose-export", async (_e, options = {}) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: path.join(
      typeof options.directory === "string" &&
        path.isAbsolute(options.directory)
        ? options.directory
        : (await preferences()).exports,
      safeName(options.name, "Video-AKhbar.mp4"),
    ),
    filters: [{ name: "Video MP4", extensions: ["mp4"] }],
  });
  return result.canceled ? null : result.filePath;
});
ipcMain.handle("export", async (_e, project, settings) => {
  if (exportController) throw Error("Esportazione già in corso");
  project = Timeline.validate(project);
  let namedPath;
  if (!settings.outputPath && settings.outputName !== undefined) {
    if (
      typeof settings.outputDirectory !== "string" ||
      !path.isAbsolute(settings.outputDirectory)
    )
      throw Error("Indica una cartella di esportazione con percorso completo");
    const name = String(settings.outputName).trim();
    if (!name || safeName(name, "") !== name)
      throw Error(
        "Nome file non valido: evita caratteri speciali e percorsi nel nome",
      );
    namedPath = path.join(
      settings.outputDirectory,
      /\.mp4$/i.test(name) ? name : name + ".mp4",
    );
    try {
      await fs.access(namedPath);
      const answer = await appDialog({
        type: "question",
        title: "File già esistente",
        message: "Sostituire il video esistente?",
        detail: namedPath,
        buttons: ["Annulla", "Sostituisci"],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response !== 1) return null;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.mkdir(settings.outputDirectory, { recursive: true });
  }
  const result =
    settings.outputPath || namedPath
      ? { filePath: settings.outputPath || namedPath }
      : {
          filePath: await reserveRecording(
            (await preferences()).exports,
            projectPath
              ? path.basename(projectPath, ".creastudio")
              : "Video-AKhbar",
            "mp4",
          ),
        };
  if (result.canceled) return null;
  const target = path.resolve(result.filePath);
  if (
    project.media.some(
      (m) =>
        m.path && path.resolve(m.path).toLowerCase() === target.toLowerCase(),
    )
  )
    throw Error("Scegli un file diverso dai media originali");
  exportController = new AbortController();
  try {
    lastExport = null;
    const completed = await renderProject(
      project,
      target,
      settings,
      binaries,
      (p) => win?.webContents.send("export-progress", p),
      exportController.signal,
    );
    await fs.access(completed);
    lastExport = completed;
    return completed;
  } finally {
    exportController = null;
  }
});
ipcMain.handle("open-export", async (_e, kind) => {
  if (exportController || !lastExport)
    throw Error("Nessun video esportato pronto.");
  try {
    await fs.access(lastExport);
  } catch {
    throw Error(
      "Il video esportato non è più disponibile nel percorso originale.",
    );
  }
  if (kind === "video") {
    const error = await shell.openPath(lastExport);
    if (error) throw Error(error);
  } else if (kind === "folder") shell.showItemInFolder(lastExport);
  else throw Error("Comando non valido");
  return true;
});
ipcMain.handle("cancel-export", () => exportController?.abort());
app.on("before-quit", () => exportController?.abort());

const waveformJobs = new Map(),
  waveformController = new AbortController();
app.on("before-quit", () => waveformController.abort());
ipcMain.handle("waveform", async (_e, file, channels) => {
  const stat = await fs.stat(file),
    key = file + ":" + stat.mtimeMs + ":" + stat.size;
  if (!waveformJobs.has(key))
    waveformJobs.set(
      key,
      waveform(file, binaries.ffmpeg, waveformController.signal).catch((e) => {
        waveformJobs.delete(key);
        throw e;
      }),
    );
  const result = await waveformJobs.get(key);
  require("./audio").rememberLevels(file, stat, result.levels, channels);
  return result;
});
ipcMain.handle("fonts", async () => {
  try {
    if (process.platform === "win32") {
      const { stdout } = await promisify(execFile)(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name | ConvertTo-Json -Compress",
        ],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      return JSON.parse(stdout);
    }
    const { stdout } = await promisify(execFile)(
      "fc-list",
      ["--format", "%{family}\n"],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    return [...new Set(stdout.split(/[\n,]/).filter(Boolean))].sort();
  } catch {
    return ["Arial", "Segoe UI", "Georgia", "Verdana", "Courier New"];
  }
});
