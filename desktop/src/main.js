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
const { renderProject } = require("./render");
const unpack = (p) =>
  app.isPackaged ? p.replace(/app\.asar([/\\])/, "app.asar.unpacked$1") : p;
const binaries = {
  ffmpeg: unpack(require("ffmpeg-static")),
  ffprobe: unpack(require("ffprobe-static").path),
};
let win, chosenSource, exportController;
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
    minHeight: 740,
    backgroundColor: "#15191f",
    title: "Crea Studio",
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
ipcMain.handle("recording-begin", async () => {
  if (recordingFile) throw Error("Registrazione già attiva");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "crea-record-"));
  const input = path.join(dir, "capture.webm");
  recordingFile = { dir, input, handle: await fs.open(input, "w") };
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
      defaultPath: `Registrazione-${Date.now()}.webm`,
      filters: [{ name: "Registrazione WebM", extensions: ["webm"] }],
    });
    if (result.canceled) return null;
    const finalized = path.join(current.dir, "final.webm");
    // MediaRecorder writes a streaming WebM without duration. Remux it before probing/importing.
    await promisify(execFile)(
      binaries.ffmpeg,
      [
        "-v",
        "error",
        "-nostdin",
        "-y",
        "-i",
        current.input,
        "-c",
        "copy",
        finalized,
      ],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    await fs.copyFile(finalized, result.filePath);
    return await inspect(result.filePath);
  } finally {
    await discardRecording();
  }
});
ipcMain.handle("save-project", async (_e, project) => {
  Timeline.validate(project);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: "Montaggio.crea.json",
    filters: [{ name: "Progetto Crea", extensions: ["json"] }],
  });
  if (result.canceled) return false;
  await fs.writeFile(result.filePath, JSON.stringify(project, null, 2));
  return true;
});
ipcMain.handle("open-project", async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "Progetto Crea", extensions: ["json"] }],
  });
  if (result.canceled) return null;
  const project = Timeline.validate(
    JSON.parse(await fs.readFile(result.filePaths[0], "utf8")),
  );
  const missing = [];
  for (const m of project.media) {
    try {
      await fs.access(m.path);
    } catch {
      missing.push(m.name);
    }
    m.url = pathToFileURL(m.path).href;
  }
  if (missing.length)
    throw Error(
      "File originali mancanti: " +
        missing.join(", ") +
        ". Ripristinali nel percorso originale prima di aprire il progetto.",
    );
  return project;
});
ipcMain.handle("export", async (_e, project, settings) => {
  if (exportController) throw Error("Esportazione già in corso");
  Timeline.validate(project);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: "Video-crea.mp4",
    filters: [{ name: "Video MP4", extensions: ["mp4"] }],
  });
  if (result.canceled) return null;
  const target = path.resolve(result.filePath);
  if (
    project.media.some(
      (m) => path.resolve(m.path).toLowerCase() === target.toLowerCase(),
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
