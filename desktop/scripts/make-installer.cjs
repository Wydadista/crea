// Build an unsigned installer with native NSIS. No Windows emulation is needed.
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { getMakeNsisPath } = require("app-builder-lib/out/toolsets/windows");
const root = path.resolve(__dirname, "..");
const pkg = require("../package.json");
const escape = (value) => value.replaceAll("$", "$$").replaceAll('"', '$\\"');
async function main() {
  const appDir = path.join(root, "dist", "win-unpacked");
  await fs.access(path.join(appDir, "Crea Studio.exe"));
  const files = [],
    directories = [];
  let size = 0;
  async function scan(dir, relative = "") {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = path.join(relative, entry.name),
        full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        directories.push(rel);
        await scan(full, rel);
      } else if (entry.isFile()) {
        files.push(rel);
        size += (await fs.stat(full)).size;
      } else throw Error("Tipo di file non supportato nel pacchetto: " + rel);
    }
  }
  await scan(appDir);
  const manifest = path.join(root, "dist", "uninstall-files.nsh");
  const win = (rel) => escape(rel.split(path.sep).join("\\"));
  const lines = files.map((rel) => `Delete "$INSTDIR\\${win(rel)}"`);
  directories.sort(
    (a, b) => b.split(path.sep).length - a.split(path.sep).length,
  );
  lines.push(...directories.map((rel) => `RMDir "$INSTDIR\\${win(rel)}"`));
  await fs.writeFile(manifest, lines.join("\n"));
  const output = path.join(
    root,
    "dist",
    `Crea-Studio-${pkg.version}-x64-Setup.exe`,
  );
  const nsis = await getMakeNsisPath();
  const prefix = process.platform === "win32" ? "/" : "-";
  const args = [
    `${prefix}V2`,
    ...Object.entries({
      APP_DIR: appDir,
      OUTPUT: output,
      VERSION: pkg.version,
      MANIFEST: manifest,
      SIZE_KB: Math.ceil(size / 1024),
    }).map(([key, value]) => `${prefix}D${key}=${value}`),
    path.join(__dirname, "installer.nsi"),
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(nsis.path, args, {
      stdio: "inherit",
      env: { ...process.env, ...nsis.env },
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("NSIS terminato con codice " + code)),
    );
  });
  const info = await fs.stat(output);
  if (info.size < 1024 * 1024) throw Error("Installer incompleto");
  console.log(
    `Installer creato: ${output} (${Math.round(info.size / 1024 / 1024)} MB)`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
