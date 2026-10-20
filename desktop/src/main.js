const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  desktopCapturer,
  session,
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
let win, chosenSource, exportController;
let projectPath = null,
  savedProject = null,
  savingProject = false;
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
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1080,
    minHeight: 820,
    backgroundColor: "#15191f",
    title: "Crea Studio",
    icon: path.join(__dirname, "project-icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-record-"));
  const input = path.join(dir, "capture.webm");
  recordingFile = { settings, dir, input, handle: await fs.open(input, "w") };
});
ipcMain.handle("recording-chunk", async (_e, buffer) => {
  if (!recordingFile?.handle) throw Error("Registrazione non attiva");
  const data = Buffer.from(buffer);
  let offset = 0;
  while (offset < data.length) {
    const { bytesWritten } = await recordingFile.handle.write(data, offset);
    offset += bytesWritten;
  }
});
async function discardRecording() {
  if (!recordingFile) return;
  const current = recordingFile;
  recordingFile = null;
  await current.handle?.close().catch(() => {});
  await fs.rm(current.dir, { recursive: true, force: true });
}
ipcMain.handle("recording-abort", discardRecording);
ipcMain.handle("recording-finish", async () => {
  if (!recordingFile) throw Error("Nessuna registrazione da salvare");
  const current = recordingFile;
  try {
    await current.handle.close();
    current.handle = null;
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `Registrazione-${Date.now()}.${current.settings.format}`,
      filters: [
        { name: "Registrazione", extensions: [current.settings.format] },
      ],
    });
    if (result.canceled) return null;
    const finalized = path.join(
      current.dir,
      `final.${current.settings.format}`,
    );
    const cfg = encoding(current.settings);
    const args = ["-v", "error", "-nostdin", "-y", "-i", current.input];
    if (current.settings.format === "mp4")
      args.push(
        "-vf",
        `fps=${cfg.fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        String(cfg.crf),
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        String(current.settings.audioBitrate || 192) + "k",
        "-movflags",
        "+faststart",
      );
    else args.push("-c", "copy");
    await promisify(execFile)(binaries.ffmpeg, [...args, finalized], {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    await fs.copyFile(finalized, result.filePath);
    return await inspect(result.filePath);
  } finally {
    await discardRecording();
  }
});
async function loadProject(file) {
  const project = Timeline.validate(
    JSON.parse(await fs.readFile(file, "utf8")),
  );
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
ipcMain.handle("save-project", async (_e, project) => {
  if (savingProject) return false;
  savingProject = true;
  try {
    project = Timeline.validate(project);
    if (!projectPath) {
      const result = await dialog.showSaveDialog(win, {
        defaultPath: "Montaggio.creastudio",
        filters: [{ name: "Progetto Crea Studio", extensions: ["creastudio"] }],
      });
      if (result.canceled) return false;
      projectPath = result.filePath;
    }
    if (
      project.media.some(
        (m) =>
          m.path &&
          path.resolve(m.path).toLowerCase() ===
            path.resolve(projectPath).toLowerCase(),
      )
    )
      throw Error("Non sovrascrivere un file multimediale con il progetto");
    await atomic(projectPath, project);
    savedProject = JSON.stringify(project);
    await fs.rm(recoveryPath(), { force: true });
    return true;
  } finally {
    savingProject = false;
  }
});
ipcMain.handle("open-project", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      {
        name: "Progetti Crea Studio (anche precedenti)",
        extensions: ["creastudio", "json"],
      },
    ],
  });
  if (result.canceled) return null;
  const data = await loadProject(result.filePaths[0]);
  projectPath = /\.creastudio$/i.test(result.filePaths[0])
    ? result.filePaths[0]
    : null;
  savedProject = JSON.stringify(data);
  await fs.rm(recoveryPath(), { force: true });
  return data;
});
ipcMain.handle("project-file", async () => {
  if (!pendingProject) return null;
  const file = pendingProject;
  pendingProject = null;
  const data = await loadProject(file);
  projectPath = /\.creastudio$/i.test(file) ? file : null;
  savedProject = JSON.stringify(data);
  await fs.rm(recoveryPath(), { force: true });
  return data;
});
ipcMain.handle("autosave", async (_e, project) => {
  if (JSON.stringify(project) === savedProject) return;
  await atomic(recoveryPath(), {
    project: Timeline.validate(project),
    path: projectPath,
    savedAt: Date.now(),
  });
});
ipcMain.handle("recover", async () => {
  try {
    const data = JSON.parse(await fs.readFile(recoveryPath(), "utf8"));
    const result = await dialog.showMessageBox(win, {
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
ipcMain.handle("audio-preview", async (_e, clip, media) => {
  const { audioFilters } = require("./audio");
  const processing = await audioFilters(clip, media, binaries.ffmpeg);
  const stat = await fs.stat(media.path);
  const key = media.path + stat.mtimeMs + processing;
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
            "-i",
            media.path,
            "-vn",
            "-af",
            processing || "anull",
            "-ac",
            "2",
            "-ar",
            "48000",
            file,
          ],
          { windowsHide: true },
        );
        return pathToFileURL(file).href;
      })().catch((e) => {
        processedAudio.delete(key);
        throw e;
      }),
    );
  return processedAudio.get(key);
});
ipcMain.handle("export", async (_e, project, settings) => {
  if (exportController) throw Error("Esportazione già in corso");
  project = Timeline.validate(project);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: "Video-crea.mp4",
    filters: [{ name: "Video MP4", extensions: ["mp4"] }],
  });
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
    return await renderProject(
      project,
      target,
      settings,
      binaries,
      (p) => win?.webContents.send("export-progress", p),
      exportController.signal,
    );
  } finally {
    exportController = null;
  }
});
ipcMain.handle("cancel-export", () => exportController?.abort());
app.on("before-quit", () => exportController?.abort());

const waveformJobs = new Map(),
  waveformController = new AbortController();
app.on("before-quit", () => waveformController.abort());
ipcMain.handle("waveform", async (_e, file) => {
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
  return waveformJobs.get(key);
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
